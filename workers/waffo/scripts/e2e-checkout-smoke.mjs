#!/usr/bin/env node
/**
 * §51 Kliq — E2E smoke test for the Waffo Worker mock checkout flow.
 *
 * 模拟用户在 Kliq app 内点击 "立即购买 Lifetime · $99" 后：
 *   1. App 调 POST ${VITE_KLQ_WAFFO_WORKER_URL}/api/waffo/checkout
 *   2. Worker 返 { ok: true, checkoutUrl, sessionId, plan, priceUsd }
 *   3. App 用 window.open(checkoutUrl) 打开结算页
 *   4. 用户付款后，Waffo 调 POST /api/waffo/webhook（mock 模式 echo）
 *
 * 用法：cd workers/waffo && node --experimental-strip-types scripts/e2e-checkout-smoke.mjs
 * （Node 22+ 支持直接跑 .ts，无需 tsx）
 */
import worker from "../src/index.ts";

const env = {
	WAFFO_MOCK_MODE: "true",
	WAFFO_ENV: "test",
	KLQ_PRO_PRICE_USD: "12.9",
	KLQ_LIFETIME_PRICE_USD: "99",
	KLQ_PRO_PRODUCT_ID: "smoketest_pro_yearly",
	KLQ_LIFETIME_PRODUCT_ID: "smoketest_lifetime",
	KLQ_STORE_ID: "STO_SMOKE",
	KLQ_MERCHANT_ID: "MER_SMOKE",
	KLQ_DEFAULT_SUCCESS_URL: "https://yanjingai.tech/checkout/success",
	KLQ_DEFAULT_CANCEL_URL: "https://yanjingai.tech/pricing",
	KLQ_CHECKOUT_SHARED_SECRET: "smoketest_bridge_secret_xyz",
};

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };

function step(name, ok, detail = "") {
	const sym = ok ? "✓" : "✗";
	console.log(`  ${sym} ${name}${detail ? ` — ${detail}` : ""}`);
	if (!ok) process.exitCode = 1;
}

async function main() {
	console.log("\n§51 Kliq E2E: Waffo Worker mock checkout flow\n");

	const healthRes = await worker.fetch(
		new Request("https://worker.local/api/health", { method: "GET" }),
		env,
		ctx,
	);
	const health = await healthRes.json();
	step("GET /api/health returns 200", healthRes.status === 200, `status=${healthRes.status}`);
	step("Health body says mode=mock", health.mode === "mock", `mode=${health.mode}`);
	step("Health has version", typeof health.version === "string", `v=${health.version}`);

	const lifetimeRes = await worker.fetch(
		new Request("https://worker.local/api/waffo/checkout", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-klq-bridge-secret": env.KLQ_CHECKOUT_SHARED_SECRET,
			},
			body: JSON.stringify({ plan: "lifetime", buyerEmail: "smoke@example.com" }),
		}),
		env,
		ctx,
	);
	const lifetime = await lifetimeRes.json();
	step("POST /api/waffo/checkout (lifetime) returns 200", lifetimeRes.status === 200);
	step("Returns ok=true", lifetime.ok === true);
	step("Returns mode=mock", lifetime.mode === "mock");
	step("Plan=lifetime", lifetime.plan === "lifetime", `plan=${lifetime.plan}`);
	step("Price=$99", lifetime.priceUsd === 99, `price=${lifetime.priceUsd}`);
	step("checkoutUrl points at waffo.example", String(lifetime.checkoutUrl).startsWith("https://waffo.example/checkout/sess_"));
	step("checkoutUrl embeds plan=lifetime", String(lifetime.checkoutUrl).includes("plan=lifetime"));
	step("checkoutUrl embeds price=99.00", String(lifetime.checkoutUrl).includes("price=99.00"));
	step("checkoutUrl embeds email", String(lifetime.checkoutUrl).includes("email=smoke%40example.com"));
	step("Has sessionId sess_*", String(lifetime.sessionId).startsWith("sess_"));
	step("Has expiresAt ISO", !Number.isNaN(Date.parse(lifetime.expiresAt)));

	const proRes = await worker.fetch(
		new Request("https://worker.local/api/waffo/checkout", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-klq-bridge-secret": env.KLQ_CHECKOUT_SHARED_SECRET,
			},
			body: JSON.stringify({ plan: "pro_yearly" }),
		}),
		env,
		ctx,
	);
	const pro = await proRes.json();
	step("POST /api/waffo/checkout (pro_yearly) returns 200", proRes.status === 200);
	step("Plan=pro_yearly", pro.plan === "pro_yearly");
	step("Price=$12.9", pro.priceUsd === 12.9, `price=${pro.priceUsd}`);

	const badRes = await worker.fetch(
		new Request("https://worker.local/api/waffo/checkout", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-klq-bridge-secret": env.KLQ_CHECKOUT_SHARED_SECRET,
			},
			body: JSON.stringify({ plan: "weekly_drip" }),
		}),
		env,
		ctx,
	);
	const bad = await badRes.json();
	step("Unknown plan → 400", badRes.status === 400);
	step("Error code = UNKNOWN_PLAN", bad.error?.code === "UNKNOWN_PLAN", `code=${bad.error?.code}`);

	const wrongRes = await worker.fetch(
		new Request("https://worker.local/api/waffo/checkout", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-klq-bridge-secret": "wrong_secret",
			},
			body: JSON.stringify({ plan: "lifetime" }),
		}),
		env,
		ctx,
	);
	const wrong = await wrongRes.json();
	step("Wrong bridge secret → 403", wrongRes.status === 403);
	step("Error code = BRIDGE_AUTH_INVALID", wrong.error?.code === "BRIDGE_AUTH_INVALID");

	const whRes = await worker.fetch(
		new Request("https://worker.local/api/waffo/webhook", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-klq-bridge-secret": env.KLQ_CHECKOUT_SHARED_SECRET,
			},
			body: JSON.stringify({
				event: "subscription.activated",
				sessionId: lifetime.sessionId,
				plan: "lifetime",
			}),
		}),
		env,
		ctx,
	);
	const wh = await whRes.json();
	step("POST /api/waffo/webhook returns 200", whRes.status === 200);
	step("Webhook mode=mock", wh.mode === "mock");
	step("Webhook echoes event", wh.received?.event === "subscription.activated");
	step("Webhook echoes sessionId", wh.received?.sessionId === lifetime.sessionId);

	const corsRes = await worker.fetch(
		new Request("https://worker.local/api/waffo/checkout", { method: "OPTIONS" }),
		env,
		ctx,
	);
	step("OPTIONS preflight returns 204", corsRes.status === 204);
	step("CORS allow-origin = *", corsRes.headers.get("access-control-allow-origin") === "*");

	console.log(process.exitCode ? "\n✗ FAIL" : "\n✓ ALL E2E CHECKOUT FLOW STEPS PASSED");
}

main().catch((err) => {
	console.error("E2E crash:", err);
	process.exitCode = 1;
});
