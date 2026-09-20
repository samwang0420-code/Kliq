/**
 * Kliq — AI 文本后端路由测试
 *
 * 重点覆盖「偏好与实际配置不一致时的回退」：这是最容易写错、也最容易让用户
 * 以为「AI 坏了」的一段逻辑。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { getChatProvider, resolveChatBackend, setChatProvider } from "./provider";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("resolveChatBackend", () => {
	it("偏好 openai 且两个都配了 → 用 openai", () => {
		expect(resolveChatBackend("openai", true, true)).toBe("openai");
	});

	it("偏好 openai 但只配了 deepseek → 回退到 deepseek", () => {
		expect(resolveChatBackend("openai", false, true)).toBe("deepseek");
	});

	it("偏好 openai 且都没配 → null（调用方据此抛未配置）", () => {
		expect(resolveChatBackend("openai", false, false)).toBeNull();
	});

	it("偏好 deepseek 且配了 → 用 deepseek", () => {
		expect(resolveChatBackend("deepseek", true, true)).toBe("deepseek");
	});

	it("偏好 deepseek 但只配了 openai → 回退到 openai", () => {
		expect(resolveChatBackend("deepseek", true, false)).toBe("openai");
	});

	it("偏好 deepseek 且都没配 → null", () => {
		expect(resolveChatBackend("deepseek", false, false)).toBeNull();
	});

	it("只有一个后端可用时，无论偏好谁都选到它", () => {
		for (const preferred of ["openai", "deepseek"] as const) {
			expect(resolveChatBackend(preferred, true, false)).toBe("openai");
			expect(resolveChatBackend(preferred, false, true)).toBe("deepseek");
		}
	});
});

describe("chatProvider 偏好读写", () => {
	it("非 Electron 环境下读默认值 openai", () => {
		vi.stubGlobal("electronAPI", undefined);
		expect(getChatProvider()).toBe("openai");
	});

	it("非 Electron 环境下写入返回失败而不是抛错", () => {
		vi.stubGlobal("electronAPI", undefined);
		const result = setChatProvider("deepseek");
		expect(result.success).toBe(false);
		expect(typeof result.error).toBe("string");
	});

	it("读到的值非法时回落到 openai", () => {
		vi.stubGlobal("electronAPI", {
			getAppSetting: () => "gemini",
			setAppSetting: () => true,
		});
		expect(getChatProvider()).toBe("openai");
	});

	it("读到合法值时原样返回", () => {
		vi.stubGlobal("electronAPI", {
			getAppSetting: () => "deepseek",
			setAppSetting: () => true,
		});
		expect(getChatProvider()).toBe("deepseek");
	});

	it("写入成功时透传 setAppSetting 的调用", () => {
		const setAppSetting = vi.fn(() => true);
		vi.stubGlobal("electronAPI", {
			getAppSetting: () => "openai",
			setAppSetting,
		});
		expect(setChatProvider("deepseek").success).toBe(true);
		expect(setAppSetting).toHaveBeenCalledWith("kliq.ai.chatProvider", "deepseek");
	});
});
