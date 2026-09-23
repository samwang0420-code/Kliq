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
 *   POST /api/waffo/checkout   → { checkoutUrl, sessionId }   (buyerEmail required)
 *   POST /api/waffo/webhook    → forward to KLQ_BILLING_UPGRADE_URL (CF Pages Function)
 *   GET  /api/health           → { ok, mode, version }
 *
 * Reference: AGENTS.md §GSPR-1 / §GSPR-2 / §59-3 (architecture + billing bridge).
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

	// §59-3 — fulfillment bridge
	// When Waffo sends a webhook, we forward it to KLQ_BILLING_UPGRADE_URL so the
	// Next.js Pages Functions layer can verify the bridge secret + upgrade the
	// matching D1 user. In mock mode this lets us exercise the entire billing
	// pipeline without the real Waffo dashboard.
	KLQ_BILLING_UPGRADE_URL?: string;
	KLQ_BILLING_BRIDGE_SECRET?: string;
}

const VERSION = "0.2.0";
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

/** Cheap RFC-5322-ish email regex. We re-validate the deeper shape on the D1 side. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
	buyerEmail: string;
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
	const { plan, buyerEmail, successUrl, cancelUrl, metadata } = parsed.body;

	if (plan !== "pro_yearly" && plan !== "lifetime") {
		return errorResponse(`Unknown plan "${plan}". Expected "pro_yearly" or "lifetime".`, 400, "UNKNOWN_PLAN");
	}

	// §59-3 — buyerEmail (or metadata.userEmail) is now required so the Waffo
	// checkout can be linked to a registered Kliq account at fulfillment time.
	const finalEmail = (metadata?.userEmail ?? buyerEmail ?? "").trim();
	if (!finalEmail) {
		return errorResponse(
			"buyerEmail (or metadata.userEmail) is required to bind checkout to a registered account",
			400,
			"BUYER_EMAIL_REQUIRED",
		);
	}
	if (!EMAIL_RE.test(finalEmail)) {
		return errorResponse("buyerEmail is not a valid email address", 400, "BUYER_EMAIL_INVALID");
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
		// hitting Waffo. The URL embeds sessionId + plan + email so the
		// fulfilment pipeline can echo them back for end-to-end testing.
		const params = new URLSearchParams({
			session: sessionId,
			plan,
			product: details.productId,
			price: details.priceUsd.toFixed(2),
			env: env.WAFFO_ENV ?? "test",
			email: finalEmail,
		});
		const checkoutUrl = `${MOCK_CHECKOUT_BASE}/${sessionId}?${params.toString()}`;

		const body: CheckoutResponseBody = {
			ok: true,
			mode: "mock",
			sessionId,
			checkoutUrl,
			plan,
			productId: details.productId,
			priceUsd: details.priceUsd,
			buyerEmail: finalEmail,
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
	//     buyerEmail: finalEmail,
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
	buyerEmail?: string;
	waffoSessionId?: string;
	[key: string]: unknown;
}

/**
 * Forward a Waffo webhook event to the Pages Function that owns D1 upgrade
 * logic. In real mode the Waffo HMAC signature has already been verified before
 * we get here (TODO §60 for production hardening). In mock mode we skip HMAC
 * verification because there is no real signed body — but the bridge secret
 * header is still required so we know the call came from a known caller.
 *
 * Returns `{ status, ok, body }` so the response can surface what the
 * fulfillment endpoint actually did.
 */
async function forwardWebhook(
	payload: WebhookForwardBody,
	env: Env,
): Promise<{ status: number; ok: boolean; body: string; error?: string }> {
	const target = env.KLQ_BILLING_UPGRADE_URL ?? "";
	if (!target) {
		return { status: 0, ok: false, body: "", error: "KLQ_BILLING_UPGRADE_URL not configured" };
	}
	const secret = env.KLQ_BILLING_BRIDGE_SECRET ?? "";
	if (!secret) {
		return { status: 0, ok: false, body: "", error: "KLQ_BILLING_BRIDGE_SECRET not configured" };
	}
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), FORWARD_TIMEOUT_MS);
	try {
		const res = await fetch(target, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-klq-bridge-secret": secret,
			},
			body: JSON.stringify(payload),
			signal: ctrl.signal,
		});
		const body = await res.text();
		return { status: res.status, ok: res.ok, body };
	} catch (err) {
		return {
			status: 0,
			ok: false,
			body: "",
			error: err instanceof Error ? err.message : "fetch failed",
		};
	} finally {
		clearTimeout(timer);
	}
}

const UPGRADE_TRIGGERING_EVENTS = new Set([
	"order.completed",
	"subscription.activated",
	"lifetime.purchased",
]);

async function handleWebhook(req: Request, env: Env): Promise<Response> {
	// In production, we would:
	//   1. Read raw body bytes
	//   2. Read X-Waffo-Signature header
	//   3. Call waffo.verifyWebhook(rawBody, signature, { environment: env.WAFFO_ENV })
	//   4. If valid, forward to Pages Function /api/billing/upgrade
	//
	// §59-3 mock mode: forward directly so we exercise the full billing pipeline.
	const parsed = await readJsonBody<WebhookForwardBody>(req);
	if ("err" in parsed) return parsed.err;

	const event = parsed.body.event;
	const plan = parsed.body.plan;

	// §59 only honours Lifetime upgrades. pro_yearly is silently acknowledged.
	const isUpgrade = plan === "lifetime" && UPGRADE_TRIGGERING_EVENTS.has(event);

	if (!isUpgrade) {
		return jsonResponse({
			ok: true,
			mode: "mock",
			forwarded: false,
			reason: `event "${event}" + plan "${plan}" does not trigger a D1 upgrade`,
		});
	}

	const forward = await forwardWebhook(parsed.body, env);
	return jsonResponse({
		ok: forward.ok,
		mode: "mock",
		forwarded: true,
		forward,
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
		fulfillmentConfigured: Boolean(env.KLQ_BILLING_UPGRADE_URL && env.KLQ_BILLING_BRIDGE_SECRET),
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
