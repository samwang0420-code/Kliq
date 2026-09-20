/**
 * Kliq — AI 文本后端选择
 *
 * 背景：Pro 权益里「文本类」动作（章节 / 摘要 / 标题 / 标签 / 社媒文案 / 翻译 /
 * 字幕校对）都是标准 chat completion，任何 OpenAI 兼容端点都能跑。而 Whisper 转录
 * 只有 OpenAI 系提供，DeepSeek 没有 audio/transcriptions 端点。
 *
 * 因此这里把「文本后端」做成用户可选项：
 *   - openai    ：转录 + 文本（Whisper 只能用这个）
 *   - deepseek  ：仅文本，价格约为 GPT-4o 的 1/10，国内可直连
 *
 * 未选择时的回退策略（宁可让它跑起来，也不要因为缺配置而全废）：
 *   偏好 deepseek 但没配 → 若配了 openai 就用 openai；反之亦然。
 *   两个都没配 → 返回 null，调用方抛「未配置」错误。
 *
 * 存储：Electron app settings，键 `kliq.ai.chatProvider`（新键统一用 kliq.* 前缀）。
 */

import { type ApiProvider, getApiKey } from "../apiKeys";

/** 可选的文本后端 */
export type ChatProvider = Extract<ApiProvider, "openai" | "deepseek">;

export const CHAT_PROVIDERS: readonly ChatProvider[] = ["openai", "deepseek"] as const;

/** app settings 里的偏好键 */
export const CHAT_PROVIDER_SETTING_KEY = "kliq.ai.chatProvider";

type SettingsApi = {
	getAppSetting?: (key: string) => unknown;
	setAppSetting?: (key: string, value: unknown) => boolean;
};

function getSettingsApi(): SettingsApi | null {
	const api = (globalThis as typeof globalThis & { electronAPI?: SettingsApi }).electronAPI;
	if (
		!api ||
		typeof api.getAppSetting !== "function" ||
		typeof api.setAppSetting !== "function"
	) {
		return null;
	}
	return api;
}

function isChatProvider(value: unknown): value is ChatProvider {
	return value === "openai" || value === "deepseek";
}

/** 读取偏好（未设置 / 值非法 → openai） */
export function getChatProvider(): ChatProvider {
	const api = getSettingsApi();
	if (!api?.getAppSetting) return "openai";
	try {
		const raw = api.getAppSetting(CHAT_PROVIDER_SETTING_KEY);
		return isChatProvider(raw) ? raw : "openai";
	} catch {
		return "openai";
	}
}

export function setChatProvider(provider: ChatProvider): { success: boolean; error?: string } {
	const api = getSettingsApi();
	if (!api?.setAppSetting) {
		return { success: false, error: "Electron settings API 不可用 (非 Electron 环境?)" };
	}
	try {
		api.setAppSetting(CHAT_PROVIDER_SETTING_KEY, provider);
		return { success: true };
	} catch (err) {
		return { success: false, error: err instanceof Error ? err.message : "未知错误" };
	}
}

/**
 * 纯函数：给定偏好与两个后端各自是否已配置，决定实际用哪个。
 * 抽出来是为了可单测（不依赖 electron / 存储）。
 */
export function resolveChatBackend(
	preferred: ChatProvider,
	hasOpenai: boolean,
	hasDeepseek: boolean,
): ChatProvider | null {
	if (preferred === "deepseek") {
		if (hasDeepseek) return "deepseek";
		if (hasOpenai) return "openai";
		return null;
	}
	if (hasOpenai) return "openai";
	if (hasDeepseek) return "deepseek";
	return null;
}

/** 结合当前存储状态，给出实际要用的文本后端（null = 一个都没配） */
export function resolveActiveChatBackend(): ChatProvider | null {
	return resolveChatBackend(
		getChatProvider(),
		getApiKey("openai") !== null,
		getApiKey("deepseek") !== null,
	);
}
