/**
 * §51 Kliq AI 模块测试共享 helper
 *
 * AI 模块在浏览器环境跑（依赖 FormData / Blob / URL.createObjectURL），
 * 但 vitest 跑在 Node + happy-dom (或 jsdom) 里。这里集中 mock：
 *   1. globalThis.electronAPI（getApiKey / getAppSetting / setAppSetting）
 *   2. global.fetch（OpenAI / DeepSeek / Anthropic 响应）
 *   3. FormData（happy-dom 自带, 不需要 polyfill）
 *
 * 用法：
 *   import { setupElectronApi, mockFetchJson, mockFetchError } from "./_test-helper";
 *   beforeEach(() => setupElectronApi({ openaiKey: "sk-test", chatProvider: "openai" }));
 *   it("calls Whisper", async () => {
 *     mockFetchJson({ text: "hello" });
 *     const result = await transcribeWithWhisper({ audioFile: new Blob([...]), ... });
 *     expect(result.text).toBe("hello");
 *   });
 */
import { afterEach, vi } from "vitest";

type ElectronSettings = Record<string, unknown>;

function createElectronApi(initial: ElectronSettings = {}): {
	getAppSetting: (key: string) => unknown;
	setAppSetting: (key: string, value: unknown) => boolean;
	settings: ElectronSettings;
} {
	const settings: ElectronSettings = { ...initial };
	return {
		getAppSetting: (key: string) => settings[key],
		setAppSetting: (key: string, value: unknown) => {
			settings[key] = value;
			return true;
		},
		settings,
	};
}

export function setupElectronApi(options: {
	openaiKey?: string | null;
	deepseekKey?: string | null;
	chatProvider?: "openai" | "deepseek" | null;
} = {}): ReturnType<typeof createElectronApi> {
	const initial: ElectronSettings = {};
	const now = Date.now();
	if (options.openaiKey) {
		initial["yanjing.apiKeys.openai"] = JSON.stringify({
			provider: "openai",
			apiKey: options.openaiKey,
			baseUrl: "https://api.openai.com/v1",
			model: "gpt-4o-mini",
			updatedAt: now,
		});
	}
	if (options.deepseekKey) {
		initial["yanjing.apiKeys.deepseek"] = JSON.stringify({
			provider: "deepseek",
			apiKey: options.deepseekKey,
			baseUrl: "https://api.deepseek.com/v1",
			model: "deepseek-chat",
			updatedAt: now,
		});
	}
	if (options.chatProvider) {
		initial["kliq.ai.chatProvider"] = options.chatProvider;
	}

	const api = createElectronApi(initial);
	(globalThis as { electronAPI?: unknown }).electronAPI = api;
	return api;
}

/** mock fetch 返回一个 JSON 响应 */
export function mockFetchJson(payload: unknown, status = 200): ReturnType<typeof vi.fn> {
	const fn = vi.fn(async () => ({
		ok: status >= 200 && status < 300,
		status,
		statusText: status === 200 ? "OK" : "Error",
		text: async () => JSON.stringify(payload),
		json: async () => payload,
	}));
	vi.stubGlobal("fetch", fn);
	return fn;
}

/** mock fetch 抛错（网络层） */
export function mockFetchNetworkError(message = "fetch failed"): ReturnType<typeof vi.fn> {
	const fn = vi.fn(async () => {
		throw new Error(message);
	});
	vi.stubGlobal("fetch", fn);
	return fn;
}

/** mock fetch 返回非 OK 状态 + 错误 body */
export function mockFetchError(status: number, errorBody: string): ReturnType<typeof vi.fn> {
	const fn = vi.fn(async () => ({
		ok: false,
		status,
		statusText: "Error",
		text: async () => errorBody,
		json: async () => ({ error: { message: errorBody } }),
	}));
	vi.stubGlobal("fetch", fn);
	return fn;
}

/** mock fetch 返回多个 JSON 响应 (队列模式), 每次 fetch 取下一个 */
export function mockFetchSequence(payloads: unknown[], status = 200): ReturnType<typeof vi.fn> {
	const fn = vi.fn(async () => {
		const idx = fn.mock.calls.length - 1;
		const payload = payloads[Math.min(idx, payloads.length - 1)] ?? {};
		return {
			ok: status >= 200 && status < 300,
			status,
			statusText: status === 200 ? "OK" : "Error",
			text: async () => JSON.stringify(payload),
			json: async () => payload,
		};
	});
	vi.stubGlobal("fetch", fn);
	return fn;
}

/** 拿当前 fetch mock, 检查被调用的 URL / headers / body */
export function getFetchMock(): ReturnType<typeof vi.fn> {
	const fn = (globalThis as { fetch?: unknown }).fetch as ReturnType<typeof vi.fn>;
	if (!fn || typeof fn.mock !== "object") {
		throw new Error("fetch is not mocked — call mockFetchJson/mockFetchError first");
	}
	return fn;
}

/** 清理 fetch mock + electronAPI,避免污染下一个 test */
afterEach(() => {
	vi.unstubAllGlobals();
	delete (globalThis as { electronAPI?: unknown }).electronAPI;
});
