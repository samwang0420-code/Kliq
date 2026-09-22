/**
 * Kliq (K) Waffo Worker — Option B mock bridge
 *
 * Implements the bridge between the Electron app and the Waffo payment platform.
 * Two modes:
 *   - WAFFO_MOCK_MODE === "true"  → return fake checkout URLs, no Waffo SDK
 *   - WAFFO_MOCK_MODE === "false" → call the real Waffo Pancake SDK (TODO once
 *                                    real merchant creds are pasted from dashboard)
 *
 * All requests must include `X-KLQ-Bridge-Secret` header (verified with constant-
 * time compare). In mock mode the secret is optional; in production it is required.
 *
 * Routes:
 *   POST /api/waffo/checkout   → { checkoutUrl, sessionId }
 *   POST /api/waffo/webhook    → forward to fulfillment URL (Electron app)
 *   GET  /api/health           → { ok, mode, version }
 *
 * Reference: AGENTS.md §GSPR-1 / §GSPR-2 (architecture rationale).
 */

export interface Env {
	// Required bindings
	WAFFO_MOCK_MODE: string;
	KLQ_CHECKOUT_SHARED_SECRET?: string;

	// Mode-aware vars (used in real mode, ignored in mock mode)
	WAFFO_ENV?: "test" | "live";
	KLQ_PRO_PRICE_USD?: string;
	KLQ_LIFETIME_PRICE_USD?: string;
	KLQ_PRO_PRODUCT_ID?: string;
	KLQ_LIFETIME_PRODUCT_ID?: string;
	KLQ_STORE_ID?: string;
	KLQ_MERCHANT_ID?: string;
	KLQ_DEFAULT_SUCCESS_URL?: string;
	KLQ_DEFAULT_CANCEL_URL?: string;
	WAFFO_PRIVATE_KEY?: string;
}

const VERSION = "0.1.0";
const MOCK_CHECKOUT_BASE = "https://waffo.example/checkout";
const FORWARD_TIMEOUT_MS = 5000;

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"x-kliq-worker-version": VERSION,
			"x-kliq-worker-mode": "mock", // runtime-determined by env
			...extraHeaders,
		},
	});
}

function errorResponse(message: string, status: number, code: string): Response {
	return jsonResponse({ ok: false, error: { code, message } }, status);
}

/** Constant-time string comparison to avoid timing-attack leaks. */
function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let mismatch = 0;
	for (let i = 0; i < a.length; i++) {
		mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return mismatch === 0;
}

/**
 * Verify the bridge secret header. Returns null if OK, or a Response with the
 * rejection error to be returned directly.
 *
 * Mock mode: the secret is OPTIONAL. If the header is present it must match;
 * if absent we let it through (so `wrangler dev --local` works without env setup).
 * Production: the secret is REQUIRED and must match.
 */
function verifyBridgeSecret(req: Request, env: Env): Response | null {
	const headerValue = req.headers.get("X-KLQ-Bridge-Secret") ?? "";
	const expected = env.KLQ_CHECKOUT_SHARED_SECRET ?? "";

	if (!expected) {
		// No secret configured — only allow in mock mode
		if (env.WAFFO_MOCK_MODE !== "true") {
			return errorResponse("Bridge secret not configured on Worker", 500, "BRIDGE_NOT_CONFIGURED");
		}
		// Mock mode + no secret = open access (dev convenience)
		return null;
	}

	// Secret configured → header must match
	if (!headerValue) {
		return errorResponse("Missing X-KLQ-Bridge-Secret header", 401, "BRIDGE_AUTH_MISSING");
	}
	if (!constantTimeEqual(headerValue, expected)) {
		return errorResponse("Invalid bridge secret", 403, "BRIDGE_AUTH_INVALID");
	}
	return null;
}

/** Parse JSON body safely. Returns null + a Response on parse failure. */
async function readJsonBody<T>(req: Request): Promise<{ body: T } | { err: Response }> {
	if (req.headers.get("content-type")?.toLowerCase().includes("application/json") !== true) {
		return { err: errorResponse("Content-Type must be application/json", 415, "BAD_CONTENT_TYPE") };
	}
	let text: string;
	try {
		text = await req.text();
	} catch {
		return { err: errorResponse("Failed to read body", 400, "BAD_BODY_READ") };
	}
	if (!text) {
		return { err: errorResponse("Empty body", 400, "EMPTY_BODY") };
	}
	try {
		return { body: JSON.parse(text) as T };
	} catch {
		return { err: errorResponse("Body is not valid JSON", 400, "INVALID_JSON") };
	}
}

/** Generate a UUID v4 using Web Crypto API (always available in Workers). */
function uuidv4(): string {
	return crypto.randomUUID();
}

/* -------------------------------------------------------------------------- */
/*  POST /api/waffo/checkout                                                  */
/* -------------------------------------------------------------------------- */

type CheckoutPlan = "pro_yearly" | "lifetime";

interface CheckoutRequestBody {
	plan: CheckoutPlan;
	buyerEmail?: string;
	successUrl?: string;
	cancelUrl?: string;
	metadata?: Record<string, string>;
}

interface CheckoutResponseBody {
	ok: true;
	mode: "mock" | "live";
	sessionId: string;
	checkoutUrl: string;
	plan: CheckoutPlan;
	productId: string;
	priceUsd: number;
	expiresAt: string;
}

function resolvePlanDetails(plan: CheckoutPlan, env: Env): { productId: string; priceUsd: number } | null {
	if (plan === "pro_yearly") {
		const productId = env.KLQ_PRO_PRODUCT_ID ?? "";
		const priceUsd = Number.parseFloat(env.KLQ_PRO_PRICE_USD ?? "0");
		if (!productId || !Number.isFinite(priceUsd) || priceUsd <= 0) return null;
		return { productId, priceUsd };
	}
	if (plan === "lifetime") {
		const productId = env.KLQ_LIFETIME_PRODUCT_ID ?? "";
		const priceUsd = Number.parseFloat(env.KLQ_LIFETIME_PRICE_USD ?? "0");
		if (!productId || !Number.isFinite(priceUsd) || priceUsd <= 0) return null;
		return { productId, priceUsd };
	}
	return null;
}

async function handleCheckout(req: Request, env: Env): Promise<Response> {
	const parsed = await readJsonBody<CheckoutRequestBody>(req);
	if ("err" in parsed) return parsed.err;
	const { plan, buyerEmail, successUrl, cancelUrl } = parsed.body;

	if (plan !== "pro_yearly" && plan !== "lifetime") {
		return errorResponse(`Unknown plan "${plan}". Expected "pro_yearly" or "lifetime".`, 400, "UNKNOWN_PLAN");
	}
	const details = resolvePlanDetails(plan, env);
	if (!details) {
		return errorResponse(
			`Plan "${plan}" is not configured on the Worker (missing productId or price)`,
			503,
			"PLAN_NOT_CONFIGURED",
		);
	}

	const sessionId = `sess_${uuidv4()}`;
	const successUrlFinal = successUrl ?? env.KLQ_DEFAULT_SUCCESS_URL ?? "";
	const cancelUrlFinal = cancelUrl ?? env.KLQ_DEFAULT_CANCEL_URL ?? "";

	if (env.WAFFO_MOCK_MODE === "true") {
		// Mock mode: return a fake checkout URL the renderer can open without
		// hitting Waffo. The URL embeds sessionId + plan so the success page
		// can echo them back for end-to-end testing.
		const params = new URLSearchParams({
			session: sessionId,
			plan,
			product: details.productId,
			price: details.priceUsd.toFixed(2),
			env: env.WAFFO_ENV ?? "test",
		});
		if (buyerEmail) params.set("email", buyerEmail);
		const checkoutUrl = `${MOCK_CHECKOUT_BASE}/${sessionId}?${params.toString()}`;

		const body: CheckoutResponseBody = {
			ok: true,
			mode: "mock",
			sessionId,
			checkoutUrl,
			plan,
			productId: details.productId,
			priceUsd: details.priceUsd,
			expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
		};
		return jsonResponse(body, 200);
	}

	// TODO(real mode): instantiate WaffoPancake and createSession
	//   const waffo = new WaffoPancake({
	//     merchantId: env.KLQ_MERCHANT_ID!,
	//     privateKey: env.WAFFO_PRIVATE_KEY!,
	//     environment: env.WAFFO_ENV ?? "test",
	//   });
	//   const session = await waffo.client.checkout.createSession({
	//     storeId: env.KLQ_STORE_ID!,
	//     productId: details.productId,
	//     productType: plan === "lifetime" ? "onetime" : "subscription",
	//     currency: "USD",
	//     buyerEmail,
	//     successUrl: successUrlFinal,
	//     cancelUrl: cancelUrlFinal,
	//     metadata: parsed.body.metadata,
	//   });
	//   return jsonResponse({ ok: true, mode: "live", sessionId: session.id, checkoutUrl: session.url, ... });
	//
	// Not implemented in §50 (mock-mode milestone). User will paste real
	// WAFFO_PRIVATE_KEY once Waffo dashboard is provisioned.
	return errorResponse(
		"Live mode not yet wired (TODO: instantiate @waffo/pancake-ts once WAFFO_PRIVATE_KEY is provided)",
		501,
		"LIVE_MODE_NOT_IMPLEMENTED",
	);
}

/* -------------------------------------------------------------------------- */
/*  POST /api/waffo/webhook                                                   */
/* -------------------------------------------------------------------------- */

interface WebhookForwardBody {
	event: string;
	sessionId?: string;
	plan?: CheckoutPlan;
	[key: string]: unknown;
}

async function handleWebhook(req: Request, _env: Env): Promise<Response> {
	// In production, we would:
	//   1. Read raw body bytes
	//   2. Read X-Waffo-Signature header
	//   3. Call waffo.verifyWebhook(rawBody, signature, { environment: env.WAFFO_ENV })
	//   4. If valid, forward to Electron app fulfillment endpoint
	//
	// For §50 mock mode we just echo the payload so dev can confirm routing.
	const parsed = await readJsonBody<WebhookForwardBody>(req);
	if ("err" in parsed) return parsed.err;

	// Acknowledge immediately; forwarding is a separate concern (§GSPR-2 says
	// the Electron main process owns fulfillment, so we don't forward from the
	// Worker in mock mode).
	return jsonResponse({
		ok: true,
		mode: "mock",
		received: parsed.body,
		note: "Mock mode: webhook acknowledged but not forwarded. Production mode will forward to Electron main process fulfillment endpoint via signed POST.",
	});
}

/* -------------------------------------------------------------------------- */
/*  GET /api/health                                                           */
/* -------------------------------------------------------------------------- */

function handleHealth(env: Env): Response {
	const mode: "mock" | "live" = env.WAFFO_MOCK_MODE === "true" ? "mock" : "live";
	return jsonResponse({
		ok: true,
		version: VERSION,
		mode,
		env: env.WAFFO_ENV ?? "test",
		storeConfigured: Boolean(env.KLQ_STORE_ID && env.KLQ_MERCHANT_ID),
		hasPrivateKey: Boolean(env.WAFFO_PRIVATE_KEY),
		timestamp: new Date().toISOString(),
	});
}

/* -------------------------------------------------------------------------- */
/*  Router                                                                    */
/* -------------------------------------------------------------------------- */

export default {
	async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
		const url = new URL(req.url);
		const { pathname } = url;
		const method = req.method.toUpperCase();

		// CORS preflight (cheap, no auth)
		if (method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: {
					"access-control-allow-origin": "*",
					"access-control-allow-methods": "GET, POST, OPTIONS",
					"access-control-allow-headers": "content-type, x-klq-bridge-secret, x-waffo-signature",
					"access-control-max-age": "86400",
				},
			});
		}

		// Health is public
		if (method === "GET" && pathname === "/api/health") {
			return handleHealth(env);
		}

		// Bridge auth for /api/waffo/*
		const authFailure = verifyBridgeSecret(req, env);
		if (authFailure) return authFailure;

		// Add CORS to all responses
		const withCors = (res: Response): Response => {
			res.headers.set("access-control-allow-origin", "*");
			return res;
		};

		if (method === "POST" && pathname === "/api/waffo/checkout") {
			return withCors(await handleCheckout(req, env));
		}
		if (method === "POST" && pathname === "/api/waffo/webhook") {
			return withCors(await handleWebhook(req, env));
		}

		return errorResponse(`Not found: ${method} ${pathname}`, 404, "NOT_FOUND");
	},
};
