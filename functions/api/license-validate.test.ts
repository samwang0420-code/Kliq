/**
 * license-validate Pages Function 的契约测试。
 *
 * 背景（P0 回归）：Lemon Squeezy 对「不存在的 key」返回 404。此前这个函数把
 * 上游状态码原样透传，客户端把 404 解读为「校验端点未部署 → 离线激活」，
 * 于是伪造前缀的假 key 就能白嫖 Pro。修复后：上游 404/400 必须转成
 * 200 + { valid: false }（确定性拒绝）；上游故障（5xx/429/凭据）转成 503
 * （客户端降级离线激活，不迁怒于 key）。这里的用例就是把这次修复钉死。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const ENV = {
	LEMON_SQUEEZY_API_KEY: "test-api-key",
	LEMON_SQUEEZY_STORE: "test-store",
	LEMON_SQUEEZY_PRODUCT_ID: "test-product",
};

function post(key: unknown, env: Record<string, string> = ENV) {
	const request = new Request("https://yanjingai.tech/api/license-validate", {
		method: "POST",
		body: JSON.stringify({ licenseKey: key }),
		headers: { "content-type": "application/json" },
	});
	return import("./license-validate").then((m) => m.onRequestPost({ request, env }));
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("POST /api/license-validate", () => {
	it("rejects a missing licenseKey with 400", async () => {
		const res = await post("");
		expect(res.status).toBe(400);
		expect(await res.json()).toMatchObject({ valid: false });
	});

	it("rejects a wrong prefix with 400 before calling upstream", async () => {
		const spy = vi.spyOn(globalThis, "fetch");
		const res = await post("nope-1a2b3c4d");
		expect(res.status).toBe(400);
		expect(spy).not.toHaveBeenCalled();
	});

	it("returns 200 { valid: true } when upstream validates the key", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					valid: true,
					license_key: { created_at: "2026-09-01T00:00:00Z", expires_at: null },
				}),
				{ status: 200 },
			),
		);

		const res = await post("kliq-pro-1a2b3c4d");
		expect(res.status).toBe(200);
		const data = (await res.json()) as { valid: boolean; expiresAt: number | null };
		expect(data.valid).toBe(true);
		expect(data.expiresAt).toBeNull(); // 一次性买断
	});

	it("returns 200 { valid: false } when upstream explicitly denies the key", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ valid: false, error: "activation limit" }), {
				status: 200,
			}),
		);

		const res = await post("kliq-pro-deadbeef");
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ valid: false, error: "activation limit" });
	});

	it("MUST translate upstream 404 (key not found) into 200 { valid: false } — never a passthrough 404", async () => {
		// 若这条测试看到 404，客户端会走「端点缺失 → 离线激活」回退，假 key 直接变 Pro。
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ error: "Not Found" }), { status: 404 }),
		);

		const res = await post("kliq-pro-deadbeef");
		expect(res.status).toBe(200);
		const data = (await res.json()) as { valid: boolean; error?: string };
		expect(data.valid).toBe(false);
		expect(data.error).toContain("not found");
	});

	it("translates upstream failure (5xx/429/credentials) into 503 so the client degrades offline instead of judging the key", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("upstream exploded", { status: 500 }),
		);

		const res = await post("kliq-pro-1a2b3c4d");
		expect(res.status).toBe(503);
		expect(await res.json()).toMatchObject({ valid: false });
	});
});
