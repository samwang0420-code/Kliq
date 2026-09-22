/**
 * §52 — apiKeys.ts 端到端测试
 *
 * 覆盖 9 个 exported 函数:
 * - getApiKey / setApiKey / deleteApiKey / hasAnyApiKey / listConfiguredProviders
 * - validateApiKeyFormat (4 provider 验证规则)
 * - maskApiKey
 * - getElectronSettingsApi fallback
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
	getApiKey,
	setApiKey,
	deleteApiKey,
	hasAnyApiKey,
	listConfiguredProviders,
	validateApiKeyFormat,
	maskApiKey,
	type ApiKeyEntry,
} from "./apiKeys";

/** mock electronAPI: 一个简单的 key-value store */
function createMockElectronApi() {
	const store: Record<string, unknown> = {};
	return {
		store,
		api: {
			getAppSetting: (key: string) => store[key],
			setAppSetting: (key: string, value: unknown) => {
				store[key] = value;
				return true;
			},
		},
	};
}

beforeEach(() => {
	(globalThis as { electronAPI?: unknown }).electronAPI = undefined;
});

describe("getApiKey / setApiKey / deleteApiKey", () => {
	it("无 electronAPI → getApiKey 返 null", () => {
		expect(getApiKey("openai")).toBeNull();
	});

	it("setApiKey 无 electronAPI → 返 success=false", () => {
		const entry: ApiKeyEntry = {
			provider: "openai",
			apiKey: "sk-test-1234567890",
			updatedAt: 0,
		};
		const result = setApiKey(entry);
		expect(result.success).toBe(false);
		expect(result.error).toContain("Electron");
	});

	it("setApiKey 写 → getApiKey 读回 → 字段一致", () => {
		const { api } = createMockElectronApi();
		(globalThis as { electronAPI?: unknown }).electronAPI = api;
		const entry: ApiKeyEntry = {
			provider: "openai",
			apiKey: "sk-test-abc123def456",
			baseUrl: "https://api.openai.com/v1",
			model: "gpt-4o-mini",
			updatedAt: 0,
		};
		expect(setApiKey(entry).success).toBe(true);
		const got = getApiKey("openai");
		expect(got).not.toBeNull();
		expect(got?.apiKey).toBe("sk-test-abc123def456");
		expect(got?.baseUrl).toBe("https://api.openai.com/v1");
		expect(got?.model).toBe("gpt-4o-mini");
		expect(got?.updatedAt).toBeGreaterThan(0);
	});

	it("deleteApiKey 清空已存在的 key", () => {
		const { api } = createMockElectronApi();
		(globalThis as { electronAPI?: unknown }).electronAPI = api;
		setApiKey({ provider: "deepseek", apiKey: "sk-deepseek-1234567890", updatedAt: 0 });
		expect(getApiKey("deepseek")).not.toBeNull();
		expect(deleteApiKey("deepseek").success).toBe(true);
		expect(getApiKey("deepseek")).toBeNull();
	});

	it("setApiKey 写入非 JSON → getApiKey 返 null (catch)", () => {
		const { api, store } = createMockElectronApi();
		(globalThis as { electronAPI?: unknown }).electronAPI = api;
		store["yanjing.apiKeys.openai"] = "not-json{";
		expect(getApiKey("openai")).toBeNull();
	});
});

describe("hasAnyApiKey / listConfiguredProviders", () => {
	it("无任何 key → hasAnyApiKey=false, list=[]", () => {
		const { api } = createMockElectronApi();
		(globalThis as { electronAPI?: unknown }).electronAPI = api;
		expect(hasAnyApiKey()).toBe(false);
		expect(listConfiguredProviders()).toEqual([]);
	});

	it("只配 openai → 只 list openai", () => {
		const { api } = createMockElectronApi();
		(globalThis as { electronAPI?: unknown }).electronAPI = api;
		setApiKey({ provider: "openai", apiKey: "sk-test-1234567890", updatedAt: 0 });
		expect(hasAnyApiKey()).toBe(true);
		expect(listConfiguredProviders()).toEqual(["openai"]);
	});

	it("配 openai + deepseek → list 2 项", () => {
		const { api } = createMockElectronApi();
		(globalThis as { electronAPI?: unknown }).electronAPI = api;
		setApiKey({ provider: "openai", apiKey: "sk-openai-1234567890", updatedAt: 0 });
		setApiKey({ provider: "deepseek", apiKey: "sk-deepseek-1234567890", updatedAt: 0 });
		const list = listConfiguredProviders();
		expect(list).toContain("openai");
		expect(list).toContain("deepseek");
		expect(list).toHaveLength(2);
	});

	it("删掉 openai 后只剩 deepseek", () => {
		const { api } = createMockElectronApi();
		(globalThis as { electronAPI?: unknown }).electronAPI = api;
		setApiKey({ provider: "openai", apiKey: "sk-openai-1234567890", updatedAt: 0 });
		setApiKey({ provider: "deepseek", apiKey: "sk-deepseek-1234567890", updatedAt: 0 });
		deleteApiKey("openai");
		expect(listConfiguredProviders()).toEqual(["deepseek"]);
	});
});

describe("validateApiKeyFormat", () => {
	it("openai key 必须 sk- 开头且 ≥ 20 字符", () => {
		expect(validateApiKeyFormat("openai", "sk-abc123def456ghi789")).toBe(true);
		expect(validateApiKeyFormat("openai", "sk-abc")).toBe(false);  // 太短
		expect(validateApiKeyFormat("openai", "pk-abc123def456ghi789")).toBe(false);  // 前缀错
		expect(validateApiKeyFormat("openai", "")).toBe(false);
		expect(validateApiKeyFormat("openai", "  sk-abc123def456ghi789  ")).toBe(true);  // trim
	});

	it("anthropic key 必须 sk-ant- 开头", () => {
		expect(validateApiKeyFormat("anthropic", "sk-ant-api03-abc123def456")).toBe(true);
		expect(validateApiKeyFormat("anthropic", "sk-abc123def456ghi789")).toBe(false);
	});

	it("deepseek key sk- 开头 (OpenAI 兼容格式)", () => {
		expect(validateApiKeyFormat("deepseek", "sk-deepseek-1234567890")).toBe(true);
		expect(validateApiKeyFormat("deepseek", "sk-abc")).toBe(false);
	});

	it("custom 任意 ≥ 10 字符", () => {
		expect(validateApiKeyFormat("custom", "my-custom-key-12345")).toBe(true);
		expect(validateApiKeyFormat("custom", "short")).toBe(false);
	});
});

describe("maskApiKey", () => {
	it("key 长度 > 10 → 前 4 + ... + 后 4", () => {
		expect(maskApiKey("sk-abc123def456ghi789")).toBe("sk-a...i789");
	});

	it("key 长度 ≤ 10 → ***", () => {
		expect(maskApiKey("short")).toBe("***");
		expect(maskApiKey("")).toBe("");
	});
});
