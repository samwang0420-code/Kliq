/**
 * Kliq (K) Waffo Worker — Unit tests for handler logic.
 *
 * Uses the same `fetch` handler entry shape as src/index.ts so we can call
 * `default.fetch(req, env)` directly without a real network roundtrip.
 *
 * Mocks: fetch() itself (for forwardWebhook test) + ExecutionContext (unused).
 */

import { describe, it, expect, vi } from "vitest";
import worker from "./index";

function makeEnv(overrides: Partial<Env> = {}): Env {
	return {
		WAFFO_MOCK_MODE: "true",
		WAFFO_ENV: "test",
		KLQ_PRO_PRICE_USD: "12.9",
		KLQ_LIFETIME_PRICE_USD: "99",
		KLQ_PRO_PRODUCT_ID: "mock_pro_yearly",
		KLQ_LIFETIME_PRODUCT_ID: "mock_lifetime_one_time",
		KLQ_STORE_ID: "STO_MOCK",
		KLQ_MERCHANT_ID: "MER_MOCK",
		KLQ_DEFAULT_SUCCESS_URL: "https://yanjingai.tech/checkout/success",
		KLQ_DEFAULT_CANCEL_URL: "https://yanjingai.tech/pricing",
		KLQ_CHECKOUT_SHARED_SECRET: "",
		KLQ_BILLING_UPGRADE_URL: "",
		KLQ_BILLING_BRIDGE_SECRET: "",
		...overrides,
	};
}

function makeRequest(path: string, init: RequestInit = {}, env?: Env): Request {
	const url = `https://worker.local${path}`;
	const headers = new Headers(init.headers);
	headers.set("content-type", "application/json");
	if (env?.KLQ_CHECKOUT_SHARED_SECRET) {
		headers.set("X-KLQ-Bridge-Secret", env.KLQ_CHECKOUT_SHARED_SECRET);
	}
	return new Request(url, { ...init, headers });
}

// Types imported from worker module (we re-export Env for tests below)
import type { Env } from "./index";

const ctx: ExecutionContext = {
	waitUntil: () => {},
	passThroughOnException: () => {},
};

describe("Worker health endpoint", () => {
	it("returns ok + mode info (mock)", async () => {
		const res = await worker.fetch(
			makeRequest("/api/health", { method: "GET" }),
			makeEnv(),
			ctx,
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.ok).toBe(true);
		expect(body.mode).toBe("mock");
		expect(body.env).toBe("test");
		expect(body.version).toBeDefined();
		expect(body.fulfillmentConfigured).toBe(false);
	});

	it("returns ok + mode info (live) when WAFFO_MOCK_MODE = false", async () => {
		const env = makeEnv({
			WAFFO_MOCK_MODE: "false",
			KLQ_BILLING_UPGRADE_URL: "https://example.com/api/billing/upgrade",
			KLQ_BILLING_BRIDGE_SECRET: "secret",
		});
		const res = await worker.fetch(
			makeRequest("/api/health", { method: "GET" }),
			env,
			ctx,
		);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.mode).toBe("live");
		expect(body.fulfillmentConfigured).toBe(true);
	});
});

describe("Worker /api/waffo/checkout (mock mode)", () => {
	it("returns a fake checkoutUrl for pro_yearly (buyerEmail required)", async () => {
		const res = await worker.fetch(
			makeRequest("/api/waffo/checkout", {
				method: "POST",
				body: JSON.stringify({ plan: "pro_yearly", buyerEmail: "test@example.com" }),
			}),
			makeEnv(),
			ctx,
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.ok).toBe(true);
		expect(body.mode).toBe("mock");
		expect(body.plan).toBe("pro_yearly");
		expect(body.priceUsd).toBe(12.9);
		expect(body.buyerEmail).toBe("test@example.com");
		expect(String(body.checkoutUrl)).toMatch(/^https:\/\/waffo\.example\/checkout\/sess_/);
		expect(String(body.checkoutUrl)).toContain("plan=pro_yearly");
		expect(String(body.checkoutUrl)).toContain("email=test%40example.com");
	});

	it("returns a fake checkoutUrl for lifetime (buyerEmail required)", async () => {
		const res = await worker.fetch(
			makeRequest("/api/waffo/checkout", {
				method: "POST",
				body: JSON.stringify({ plan: "lifetime", buyerEmail: "alice@example.com" }),
			}),
			makeEnv(),
			ctx,
		);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.plan).toBe("lifetime");
		expect(body.priceUsd).toBe(99);
		expect(body.buyerEmail).toBe("alice@example.com");
	});

	it("accepts metadata.userEmail as an alternative to buyerEmail", async () => {
		const res = await worker.fetch(
			makeRequest("/api/waffo/checkout", {
				method: "POST",
				body: JSON.stringify({
					plan: "lifetime",
					metadata: { userEmail: "bob@example.com" },
				}),
			}),
			makeEnv(),
			ctx,
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.buyerEmail).toBe("bob@example.com");
	});

	it("rejects when neither buyerEmail nor metadata.userEmail is provided", async () => {
		const res = await worker.fetch(
			makeRequest("/api/waffo/checkout", {
				method: "POST",
				body: JSON.stringify({ plan: "lifetime" }),
			}),
			makeEnv(),
			ctx,
		);
		expect(res.status).toBe(400);
		const body = (await res.json()) as Record<string, unknown>;
		expect((body.error as { code?: string }).code).toBe("BUYER_EMAIL_REQUIRED");
	});

	it("rejects invalid email", async () => {
		const res = await worker.fetch(
			makeRequest("/api/waffo/checkout", {
				method: "POST",
				body: JSON.stringify({ plan: "lifetime", buyerEmail: "not-an-email" }),
			}),
			makeEnv(),
			ctx,
		);
		expect(res.status).toBe(400);
		const body = (await res.json()) as Record<string, unknown>;
		expect((body.error as { code?: string }).code).toBe("BUYER_EMAIL_INVALID");
	});

	it("rejects unknown plan", async () => {
		const res = await worker.fetch(
			makeRequest("/api/waffo/checkout", {
				method: "POST",
				body: JSON.stringify({ plan: "weekly_drip", buyerEmail: "test@example.com" }),
			}),
			makeEnv(),
			ctx,
		);
		expect(res.status).toBe(400);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.ok).toBe(false);
		expect((body.error as { code?: string }).code).toBe("UNKNOWN_PLAN");
	});

	it("rejects empty body", async () => {
		const res = await worker.fetch(
			makeRequest("/api/waffo/checkout", { method: "POST", body: "" }),
			makeEnv(),
			ctx,
		);
		expect(res.status).toBe(400);
	});

	it("rejects non-JSON content type", async () => {
		const url = "https://worker.local/api/waffo/checkout";
		const req = new Request(url, {
			method: "POST",
			headers: { "content-type": "text/plain" },
			body: JSON.stringify({ plan: "pro_yearly", buyerEmail: "test@example.com" }),
		});
		const res = await worker.fetch(req, makeEnv(), ctx);
		expect(res.status).toBe(415);
	});
});

describe("Worker /api/waffo/webhook (mock mode)", () => {
	it("forwards lifetime+order.completed to KLQ_BILLING_UPGRADE_URL with bridge secret", async () => {
		const fetchSpy = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ ok: true, upgraded: true }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchSpy);

		const env = makeEnv({
			KLQ_BILLING_UPGRADE_URL: "https://yanjingai.tech/api/billing/upgrade",
			KLQ_BILLING_BRIDGE_SECRET: "bridge-secret-xyz",
		});

		const res = await worker.fetch(
			makeRequest("/api/waffo/webhook", {
				method: "POST",
				body: JSON.stringify({
					event: "order.completed",
					plan: "lifetime",
					buyerEmail: "alice@example.com",
					sessionId: "sess_test",
				}),
			}),
			env,
			ctx,
		);

		expect(res.status).toBe(200);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [calledUrl, calledInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(calledUrl).toBe("https://yanjingai.tech/api/billing/upgrade");
		expect(calledInit.method).toBe("POST");
		const headers = calledInit.headers as Record<string, string>;
		expect(headers["x-klq-bridge-secret"]).toBe("bridge-secret-xyz");
		expect(headers["content-type"]).toBe("application/json");
		expect(JSON.parse(calledInit.body as string)).toEqual({
			event: "order.completed",
			plan: "lifetime",
			buyerEmail: "alice@example.com",
			sessionId: "sess_test",
		});

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.forwarded).toBe(true);
		expect(body.ok).toBe(true);

		vi.unstubAllGlobals();
	});

	it("forwards subscription.activated event for lifetime plan", async () => {
		const fetchSpy = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ ok: true }), { status: 200 }),
		);
		vi.stubGlobal("fetch", fetchSpy);

		const env = makeEnv({
			KLQ_BILLING_UPGRADE_URL: "https://yanjingai.tech/api/billing/upgrade",
			KLQ_BILLING_BRIDGE_SECRET: "bridge-secret",
		});

		const res = await worker.fetch(
			makeRequest("/api/waffo/webhook", {
				method: "POST",
				body: JSON.stringify({
					event: "subscription.activated",
					plan: "lifetime",
					buyerEmail: "bob@example.com",
				}),
			}),
			env,
			ctx,
		);

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(res.status).toBe(200);

		vi.unstubAllGlobals();
	});

	it("does not forward pro_yearly events (only lifetime triggers D1 upgrade)", async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);

		const env = makeEnv({
			KLQ_BILLING_UPGRADE_URL: "https://yanjingai.tech/api/billing/upgrade",
			KLQ_BILLING_BRIDGE_SECRET: "bridge-secret",
		});

		const res = await worker.fetch(
			makeRequest("/api/waffo/webhook", {
				method: "POST",
				body: JSON.stringify({
					event: "order.completed",
					plan: "pro_yearly",
					buyerEmail: "carol@example.com",
				}),
			}),
			env,
			ctx,
		);

		expect(fetchSpy).not.toHaveBeenCalled();
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.forwarded).toBe(false);

		vi.unstubAllGlobals();
	});

	it("reports ok=false when forward fetch returns 500", async () => {
		const fetchSpy = vi.fn().mockResolvedValue(
			new Response("server error", { status: 500 }),
		);
		vi.stubGlobal("fetch", fetchSpy);

		const env = makeEnv({
			KLQ_BILLING_UPGRADE_URL: "https://yanjingai.tech/api/billing/upgrade",
			KLQ_BILLING_BRIDGE_SECRET: "bridge-secret",
		});

		const res = await worker.fetch(
			makeRequest("/api/waffo/webhook", {
				method: "POST",
				body: JSON.stringify({
					event: "order.completed",
					plan: "lifetime",
					buyerEmail: "dan@example.com",
				}),
			}),
			env,
			ctx,
		);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.ok).toBe(false);
		const forward = body.forward as { status: number; ok: boolean };
		expect(forward.status).toBe(500);
		expect(forward.ok).toBe(false);

		vi.unstubAllGlobals();
	});

	it("returns ok=false when KLQ_BILLING_UPGRADE_URL not configured", async () => {
		const env = makeEnv({
			KLQ_BILLING_UPGRADE_URL: "",
			KLQ_BILLING_BRIDGE_SECRET: "bridge-secret",
		});

		const res = await worker.fetch(
			makeRequest("/api/waffo/webhook", {
				method: "POST",
				body: JSON.stringify({
					event: "order.completed",
					plan: "lifetime",
					buyerEmail: "eve@example.com",
				}),
			}),
			env,
			ctx,
		);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.ok).toBe(false);
		expect(body.forwarded).toBe(true);
		const forward = body.forward as { error?: string };
		expect(forward.error).toContain("KLQ_BILLING_UPGRADE_URL");
	});

	it("returns ok=false when KLQ_BILLING_BRIDGE_SECRET not configured", async () => {
		const env = makeEnv({
			KLQ_BILLING_UPGRADE_URL: "https://yanjingai.tech/api/billing/upgrade",
			KLQ_BILLING_BRIDGE_SECRET: "",
		});

		const res = await worker.fetch(
			makeRequest("/api/waffo/webhook", {
				method: "POST",
				body: JSON.stringify({
					event: "order.completed",
					plan: "lifetime",
					buyerEmail: "frank@example.com",
				}),
			}),
			env,
			ctx,
		);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.ok).toBe(false);
		const forward = body.forward as { error?: string };
		expect(forward.error).toContain("KLQ_BILLING_BRIDGE_SECRET");
	});
});

describe("Worker bridge auth", () => {
	it("rejects missing header when secret is configured", async () => {
		const env = makeEnv({ KLQ_CHECKOUT_SHARED_SECRET: "supersecret123" });
		const res = await worker.fetch(
			makeRequest("/api/waffo/checkout", {
				method: "POST",
				body: JSON.stringify({ plan: "pro_yearly", buyerEmail: "test@example.com" }),
			}),
			env,
		);
		expect(res.status).toBe(401);
		const body = (await res.json()) as Record<string, unknown>;
		expect((body.error as { code?: string }).code).toBe("BRIDGE_AUTH_MISSING");
	});

	it("rejects wrong header value", async () => {
		const env = makeEnv({ KLQ_CHECKOUT_SHARED_SECRET: "supersecret123" });
		const url = "https://worker.local/api/waffo/checkout";
		const req = new Request(url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-klq-bridge-secret": "wrongvalue",
			},
			body: JSON.stringify({ plan: "pro_yearly", buyerEmail: "test@example.com" }),
		});
		const res = await worker.fetch(req, env, ctx);
		expect(res.status).toBe(403);
		const body = (await res.json()) as Record<string, unknown>;
		expect((body.error as { code?: string }).code).toBe("BRIDGE_AUTH_INVALID");
	});

	it("accepts correct header value", async () => {
		const env = makeEnv({ KLQ_CHECKOUT_SHARED_SECRET: "supersecret123" });
		const url = "https://worker.local/api/waffo/checkout";
		const req = new Request(url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-klq-bridge-secret": "supersecret123",
			},
			body: JSON.stringify({ plan: "pro_yearly", buyerEmail: "test@example.com" }),
		});
		const res = await worker.fetch(req, env, ctx);
		expect(res.status).toBe(200);
	});

	it("rejects missing secret on production (live mode)", async () => {
		const env = makeEnv({
			WAFFO_MOCK_MODE: "false",
			KLQ_CHECKOUT_SHARED_SECRET: "",
		});
		const res = await worker.fetch(
			makeRequest("/api/waffo/checkout", {
				method: "POST",
				body: JSON.stringify({ plan: "pro_yearly", buyerEmail: "test@example.com" }),
			}),
			env,
		);
		expect(res.status).toBe(500);
		const body = (await res.json()) as Record<string, unknown>;
		expect((body.error as { code?: string }).code).toBe("BRIDGE_NOT_CONFIGURED");
	});
});

describe("Worker routing", () => {
	it("returns 404 for unknown route", async () => {
		const res = await worker.fetch(
			makeRequest("/api/nope", { method: "GET" }),
			makeEnv(),
			ctx,
		);
		expect(res.status).toBe(404);
	});

	it("handles CORS preflight", async () => {
		const url = "https://worker.local/api/waffo/checkout";
		const req = new Request(url, { method: "OPTIONS" });
		const res = await worker.fetch(req, makeEnv(), ctx);
		expect(res.status).toBe(204);
		expect(res.headers.get("access-control-allow-origin")).toBe("*");
	});
});
