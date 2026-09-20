/**
 * Kliq (Kliq) — API Key 管理模块
 *
 * 目标: 安全地把用户的 OpenAI / Anthropic API key 存储在本地,
 *       永远不发送到我们的服务器 (我们没有服务器)。
 *
 * 设计原则:
 * 1. **本地存储**: 通过 Electron app.getPath('userData') + electron-settings 存储
 * 2. **永不上传**: 我们的 Cloudflare Pages 是纯静态站, 没有后端
 * 3.1 **Provider**: openai / anthropic / deepseek / custom
 * 3. **明文 vs 加密**: key 仅在用户本地加密存储, 第一次读取时要求用户输入主密码 (可选)
 * 4. **简化模式**: 默认情况下明文存储 (与 .env 文件相同), 用户可选择升级
 *
 * Stage 1: 骨架版本, 提供 setApiKey / getApiKey / hasApiKey 三个基础 API
 * Stage 4: 接入 OpenAI Whisper / GPT-4 实际调用
 */

const STORAGE_KEY_PREFIX = "yanjing.apiKeys.";

export type ApiProvider = "openai" | "anthropic" | "deepseek" | "custom";

export type ApiKeyEntry = {
	provider: ApiProvider;
	apiKey: string;
	baseUrl?: string;
	model?: string;
	updatedAt: number;
};

type ElectronSettingsApi = Pick<Window["electronAPI"], "getAppSetting" | "setAppSetting">;

function getElectronSettingsApi(): ElectronSettingsApi | null {
	const api = (globalThis as typeof globalThis & { electronAPI?: ElectronSettingsApi })
		.electronAPI;
	if (
		!api ||
		typeof api.getAppSetting !== "function" ||
		typeof api.setAppSetting !== "function"
	) {
		return null;
	}
	return api;
}

/**
 * 获取指定 provider 的 API key 条目
 */
export function getApiKey(provider: ApiProvider): ApiKeyEntry | null {
	const api = getElectronSettingsApi();
	if (!api) return null;

	try {
		const raw: unknown = api.getAppSetting(`${STORAGE_KEY_PREFIX}${provider}`);
		if (typeof raw !== "string") return null;
		if (!raw) return null;
		return JSON.parse(raw) as ApiKeyEntry;
	} catch {
		return null;
	}
}

/**
 * 设置指定 provider 的 API key 条目
 */
export function setApiKey(entry: ApiKeyEntry): { success: boolean; error?: string } {
	const api = getElectronSettingsApi();
	if (!api) {
		return { success: false, error: "Electron settings API 不可用 (非 Electron 环境?)" };
	}

	try {
		const updated: ApiKeyEntry = { ...entry, updatedAt: Date.now() };
		api.setAppSetting(`${STORAGE_KEY_PREFIX}${entry.provider}`, JSON.stringify(updated));
		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : "未知错误",
		};
	}
}

/**
 * 删除指定 provider 的 API key
 */
export function deleteApiKey(provider: ApiProvider): { success: boolean } {
	const api = getElectronSettingsApi();
	if (!api) return { success: false };

	try {
		api.setAppSetting(`${STORAGE_KEY_PREFIX}${provider}`, "");
		return { success: true };
	} catch {
		return { success: false };
	}
}

/**
 * 检查是否有任何 provider 配置
 */
export function hasAnyApiKey(): boolean {
	return (
		getApiKey("openai") !== null ||
		getApiKey("anthropic") !== null ||
		getApiKey("deepseek") !== null ||
		getApiKey("custom") !== null
	);
}

/**
 * 列出所有已配置的 provider
 */
export function listConfiguredProviders(): ApiProvider[] {
	const providers: ApiProvider[] = [];
	if (getApiKey("openai")) providers.push("openai");
	if (getApiKey("anthropic")) providers.push("anthropic");
	if (getApiKey("deepseek")) providers.push("deepseek");
	if (getApiKey("custom")) providers.push("custom");
	return providers;
}

/**
 * 检查 key 是否有效 (基础格式校验)
 */
export function validateApiKeyFormat(provider: ApiProvider, key: string): boolean {
	const trimmed = key.trim();
	if (!trimmed) return false;

	switch (provider) {
		case "openai":
			// OpenAI key: sk-... or sk-proj-...
			return trimmed.startsWith("sk-") && trimmed.length >= 20;
		case "anthropic":
			// Anthropic key: sk-ant-...
			return trimmed.startsWith("sk-ant-") && trimmed.length >= 20;
		case "deepseek":
			// DeepSeek key: sk-... (OpenAI-compatible format)
			return trimmed.startsWith("sk-") && trimmed.length >= 20;
		case "custom":
			// Custom provider: 任意非空字符串
			return trimmed.length >= 10;
		default:
			return false;
	}
}

/**
 * mask API key 用于 UI 显示 (前 4 + 后 4)
 */
export function maskApiKey(key: string): string {
	if (!key) return "";
	if (key.length <= 10) return "***";
	return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
