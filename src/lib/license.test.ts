import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	ACTION_TO_PRO_FEATURE,
	actionRequiresPro,
	activateLicense,
	canUseFeature,
	deactivateLicense,
	FREE_AI_ACTIONS,
	FREE_FEATURES,
	isFreeAction,
	getLicenseStatus,
	isPro,
	maskLicenseKey,
	PRO_FEATURES,
	ProRequiredError,
	proFeatureForAction,
	requirePro,
	setLicenseStatus,
	subscribeLicense,
	validateLicenseKeyFormat,
} from "./license";
import { KLQ_LICENSE_STORAGE_KEY, LEGACY_LICENSE_STORAGE_KEYS } from "./licenseConfig";

const LEGACY_LICENSE_STORAGE_KEY = LEGACY_LICENSE_STORAGE_KEYS[0];

function createStorageMock(initialValues: Record<string, string> = {}): Storage {
	const store = new Map(Object.entries(initialValues));

	return {
		get length() {
			return store.size;
		},
		clear() {
			store.clear();
		},
		getItem(key) {
			return store.get(key) ?? null;
		},
		key(index) {
			return Array.from(store.keys())[index] ?? null;
		},
		removeItem(key) {
			store.delete(key);
		},
		setItem(key, value) {
			store.set(key, value);
		},
	};
}

function stubWindow(storage: Storage) {
	vi.stubGlobal("window", { localStorage: storage });
}

describe("license key format", () => {
	it("accepts the current prefix with 8 hex chars", () => {
		expect(validateLicenseKeyFormat("kliq-pro-1a2b3c4d")).toBe(true);
		expect(validateLicenseKeyFormat("  kliq-pro-ABCDEF01  ")).toBe(true);
	});

	it("accepts the legacy prefix so pre-rename keys keep working", () => {
		expect(validateLicenseKeyFormat("yanjing-pro-1a2b3c4d")).toBe(true);
	});

	it("rejects malformed keys", () => {
		expect(validateLicenseKeyFormat("")).toBe(false);
		expect(validateLicenseKeyFormat("kliq-pro-")).toBe(false);
		expect(validateLicenseKeyFormat("kliq-pro-1a2b3c4")).toBe(false); // 7 hex
		expect(validateLicenseKeyFormat("kliq-pro-1a2b3c4d5")).toBe(false); // 9 hex
		expect(validateLicenseKeyFormat("kliq-pro-zzzzzzzz")).toBe(false);
		expect(validateLicenseKeyFormat("pro-1a2b3c4d")).toBe(false);
	});

	it("masks all but the prefix when displayed", () => {
		expect(maskLicenseKey("kliq-pro-1a2b3c4d")).toBe("kliq-pro-1a2****");
		expect(maskLicenseKey("short")).toBe("short");
	});
});

describe("license status storage", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("defaults to the free tier without any stored state", () => {
		stubWindow(createStorageMock());
		expect(getLicenseStatus()).toMatchObject({ activated: false, tier: "free" });
		expect(isPro()).toBe(false);
	});

	it("reads the current storage key", () => {
		stubWindow(
			createStorageMock({
				[KLQ_LICENSE_STORAGE_KEY]: JSON.stringify({
					activated: true,
					tier: "pro",
					licenseKey: "kliq-pro-1a2b3c4d",
				}),
			}),
		);
		const status = getLicenseStatus();
		expect(status.activated).toBe(true);
		expect(status.tier).toBe("pro");
		expect(isPro()).toBe(true);
	});

	it("migrates legacy yanjing.license.status into the new key", () => {
		const storage = createStorageMock({
			[LEGACY_LICENSE_STORAGE_KEY]: JSON.stringify({
				activated: true,
				tier: "pro",
				licenseKey: "yanjing-pro-1a2b3c4d",
			}),
		});
		stubWindow(storage);
		expect(isPro()).toBe(true);
		// 迁移后新键应被写入，避免每次启动都重复迁移
		expect(storage.getItem(KLQ_LICENSE_STORAGE_KEY)).not.toBeNull();
	});

	it("does not count a corrupt payload as activated", () => {
		stubWindow(createStorageMock({ [KLQ_LICENSE_STORAGE_KEY]: "not-json" }));
		expect(isPro()).toBe(false);
	});

	it("never reports activated when the tier is only free", () => {
		stubWindow(
			createStorageMock({
				[KLQ_LICENSE_STORAGE_KEY]: JSON.stringify({
					activated: true,
					tier: "free",
				}),
			}),
		);
		expect(getLicenseStatus().activated).toBe(false);
	});

	it("notifies subscribers and clears state on deactivate", () => {
		stubWindow(createStorageMock());
		const seen: unknown[] = [];
		const unsubscribe = subscribeLicense((status) => seen.push(status));

		setLicenseStatus({ activated: true, tier: "pro" });
		deactivateLicense();
		unsubscribe();

		expect(seen).toHaveLength(2);
		expect(isPro()).toBe(false);
	});

	it("keeps working (as free) without a storage backend", () => {
		vi.stubGlobal("window", undefined);
		expect(getLicenseStatus()).toMatchObject({ activated: false, tier: "free" });
	});
});

describe("pro gating", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("keeps the local heuristic edits free", () => {
		stubWindow(createStorageMock());
		for (const action of ["ai-silence", "ai-fillers", "ai-speed", "ai-zoom"]) {
			expect(actionRequiresPro(action)).toBe(false);
			expect(() => requirePro(action)).not.toThrow();
		}
	});

	it("classifies every AI action as exactly one of free or Pro — no silent gap", async () => {
		// 这条是「能力声明了却没归类」的护栏：新增一个工具栏动作时，如果
		// 既没进 ACTION_TO_PRO_FEATURE、也没进 FREE_AI_ACTIONS，这里会红。
		// 上一轮审查抓到的 9 个不可达动作，本质就是这类「声明了但没接线」。
		const { AI_ACTION_IDS } = await import("./ai/action-inputs");
		const free = new Set<string>(FREE_AI_ACTIONS);
		const pro = new Set(Object.keys(ACTION_TO_PRO_FEATURE));

		expect(AI_ACTION_IDS.filter((id) => !free.has(id) && !pro.has(id))).toEqual([]);
		expect(AI_ACTION_IDS.filter((id) => free.has(id) && pro.has(id))).toEqual([]);
		expect([...free, ...pro].filter((id) => !AI_ACTION_IDS.includes(id))).toEqual([]);
		expect(free.size + pro.size).toBe(AI_ACTION_IDS.length);
	});

	it("exposes the free/Pro split through both helpers consistently", () => {
		for (const action of FREE_AI_ACTIONS) {
			expect(isFreeAction(action)).toBe(true);
			expect(actionRequiresPro(action)).toBe(false);
		}
		for (const action of Object.keys(ACTION_TO_PRO_FEATURE)) {
			expect(isFreeAction(action)).toBe(false);
			expect(actionRequiresPro(action)).toBe(true);
		}
	});

	it("keeps the free feature groups non-empty and disjoint from the Pro groups", () => {
		expect(FREE_FEATURES.length).toBeGreaterThan(0);
		for (const feature of FREE_FEATURES) {
			expect(PRO_FEATURES).not.toContain(feature);
		}
	});

	it("maps every gated action onto a declared feature group", () => {
		for (const [action, feature] of Object.entries(ACTION_TO_PRO_FEATURE)) {
			expect(PRO_FEATURES).toContain(feature);
			expect(actionRequiresPro(action)).toBe(true);
			expect(proFeatureForAction(action)).toBe(feature);
		}
	});

	it("throws ProRequiredError carrying the feature id when not activated", () => {
		stubWindow(createStorageMock());
		try {
			requirePro("transcribe");
			throw new Error("expected requirePro to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(ProRequiredError);
			expect((error as ProRequiredError).feature).toBe("transcribe");
		}
	});

	it("lets a gated feature through once Pro is active", () => {
		stubWindow(createStorageMock());
		setLicenseStatus({ activated: true, tier: "pro" });
		expect(canUseFeature("transcribe")).toBe(true);
		expect(() => requirePro("transcribe")).not.toThrow();
	});

	it("treats unknown features as free rather than locking the app", () => {
		stubWindow(createStorageMock());
		expect(canUseFeature("something-new")).toBe(true);
		expect(actionRequiresPro("something-new")).toBe(false);
	});
});

describe("activateLicense", () => {
	beforeEach(() => {
		stubWindow(createStorageMock());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("rejects a malformed key before reaching the network", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const result = await activateLicense("nope");
		expect(result.success).toBe(false);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("falls back to offline activation when no license service is configured", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const result = await activateLicense("kliq-pro-1a2b3c4d");

		expect(result.success).toBe(true);
		expect(result.status).toMatchObject({ activated: true, tier: "pro", offline: true });
		expect(result.notice).toBeTruthy();
		expect(isPro()).toBe(true);
		// 未配置校验端点 → 不应发起任何请求
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

/**
 * 在线校验路径：端点由构建期 env 注入，因此这里先 stub env 再 resetModules 动态导入，
 * 让模块在「已配置校验服务」的状态下重新初始化。
 */
describe("activateLicense (online validation)", () => {
	async function loadLicenseModuleWithSite(siteUrl: string) {
		vi.stubEnv("VITE_KLQ_SITE_URL", siteUrl);
		vi.resetModules();
		return import("./license");
	}

	beforeEach(() => {
		stubWindow(createStorageMock());
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		vi.resetModules();
	});

	it("POSTs the key to the configured validate endpoint", async () => {
		const mod = await loadLicenseModuleWithSite("https://example.com");
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ valid: true, activatedAt: 1700000000000 }), {
				status: 200,
			}),
		);

		const result = await mod.activateLicense("kliq-pro-1a2b3c4d");

		expect(fetchSpy).toHaveBeenCalledWith(
			"https://example.com/api/license-validate",
			expect.objectContaining({ method: "POST" }),
		);
		expect(result.success).toBe(true);
		expect(result.status).toMatchObject({
			activated: true,
			tier: "pro",
			offline: false,
			activatedAt: 1700000000000,
		});
	});

	it("REJECTS a 200 response that explicitly denies the key", async () => {
		// 回归防线：Pages Function 判定无效时返回的是 200 + { valid: false }，
		// 若只判 res.ok 就会把无效 key 当成激活成功。
		const mod = await loadLicenseModuleWithSite("https://example.com");
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ valid: false, error: "key not found" }), {
				status: 200,
			}),
		);

		const result = await mod.activateLicense("kliq-pro-deadbeef");

		expect(result.success).toBe(false);
		expect(result.error).toContain("key not found");
		expect(mod.isPro()).toBe(false);
	});

	it("treats a 404 as 'not registered yet' and activates offline", async () => {
		const mod = await loadLicenseModuleWithSite("https://example.com");
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));

		const result = await mod.activateLicense("kliq-pro-1a2b3c4d");

		expect(result.success).toBe(true);
		expect(result.status?.offline).toBe(true);
	});

	it("treats a 4xx other than 404 as an invalid key", async () => {
		const mod = await loadLicenseModuleWithSite("https://example.com");
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ valid: false }), { status: 403 }),
		);

		const result = await mod.activateLicense("kliq-pro-1a2b3c4d");

		expect(result.success).toBe(false);
		expect(mod.isPro()).toBe(false);
	});

	it("falls back to offline activation when the network call throws", async () => {
		const mod = await loadLicenseModuleWithSite("https://example.com");
		vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

		const result = await mod.activateLicense("kliq-pro-1a2b3c4d");

		expect(result.success).toBe(true);
		expect(result.status?.offline).toBe(true);
	});
});
