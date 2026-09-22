/**
 * Kliq (K) Waffo Worker — Unit tests for handler logic.
 *
 * Uses the same `fetch` handler entry shape as src/index.ts so we can call
 * `default.fetch(req, env)` directly without a real network roundtrip.
 *
 * Mocks: fetch() itself + ExecutionContext (unused).
 */

import { describe, it, expect } from "vitest";
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
	});

	it("returns ok + mode info (live) when WAFFO_MOCK_MODE = false", async () => {
		const res = await worker.fetch(
			makeRequest("/api/health", { method: "GET" }),
			makeEnv({ WAFFO_MOCK_MODE: "false" }),
			ctx,
		);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.mode).toBe("live");
	});
});

describe("Worker /api/waffo/checkout (mock mode)", () => {
	it("returns a fake checkoutUrl for pro_yearly", async () => {
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
		expect(String(body.checkoutUrl)).toMatch(/^https:\/\/waffo\.example\/checkout\/sess_/);
		expect(String(body.checkoutUrl)).toContain("plan=pro_yearly");
	});

	it("returns a fake checkoutUrl for lifetime", async () => {
		const res = await worker.fetch(
			makeRequest("/api/waffo/checkout", {
				method: "POST",
				body: JSON.stringify({ plan: "lifetime" }),
			}),
			makeEnv(),
			ctx,
		);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.plan).toBe("lifetime");
		expect(body.priceUsd).toBe(99);
	});

	it("rejects unknown plan", async () => {
		const res = await worker.fetch(
			makeRequest("/api/waffo/checkout", {
				method: "POST",
				body: JSON.stringify({ plan: "weekly_drip" }),
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
			body: JSON.stringify({ plan: "pro_yearly" }),
		});
		const res = await worker.fetch(req, makeEnv(), ctx);
		expect(res.status).toBe(415);
	});
});

describe("Worker /api/waffo/webhook (mock mode)", () => {
	it("acknowledges received event", async () => {
		const res = await worker.fetch(
			makeRequest("/api/waffo/webhook", {
				method: "POST",
				body: JSON.stringify({ event: "order.completed", sessionId: "sess_abc" }),
			}),
			makeEnv(),
			ctx,
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.ok).toBe(true);
		expect(body.mode).toBe("mock");
	});
});

describe("Worker bridge auth", () => {
	it("rejects missing header when secret is configured", async () => {
		const env = makeEnv({ KLQ_CHECKOUT_SHARED_SECRET: "supersecret123" });
		const res = await worker.fetch(
			makeRequest("/api/waffo/checkout", {
				method: "POST",
				body: JSON.stringify({ plan: "pro_yearly" }),
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
			body: JSON.stringify({ plan: "pro_yearly" }),
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
			body: JSON.stringify({ plan: "pro_yearly" }),
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
				body: JSON.stringify({ plan: "pro_yearly" }),
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
