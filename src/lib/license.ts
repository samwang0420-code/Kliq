/**
 * 言镜 — 许可证管理模块
 *
 * 模式: 用户通过 Lemon Squeezy 购买 → 收到 license key → 在设置页激活
 *
 * 激活流程:
 * 1. 用户输入 license key (UUID v4 格式)
 * 2. 客户端调用 Lemon Squeezy API 验证 (Stage 6 骨架阶段: 离线校验)
 * 3. 验证成功后本地存储 (electron-store) + 标识 Pro 权限
 *
 * Stage 6 落地版本 (骨架):
 * - 提供 activate / deactivate / isActivated / getStatus 四个 API
 * - 离线校验: license key 必须是 yanjing-pro-{8-char-id} 格式
 * - 在线校验: 客户端调用 /api/license/validate (后端 API 在 Stage 7 部署)
 * - Pro 权限检查: 通过 localStorage 的 yanjing.license.status 字段
 */

const LICENSE_KEY_PREFIX = "yanjing-pro-";
const LICENSE_STORAGE_KEY = "yanjing.license.status";

export type LicenseStatus = {
	activated: boolean;
	tier: "free" | "pro";
	expiresAt?: number;
	licenseKey?: string;
	activatedAt?: number;
};

const DEFAULT_STATUS: LicenseStatus = {
	activated: false,
	tier: "free",
};

function getStorage(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void } | null {
	try {
		if (typeof window === "undefined" || !window.localStorage) return null;
		return window.localStorage;
	} catch {
		return null;
	}
}

export function getLicenseStatus(): LicenseStatus {
	const storage = getStorage();
	if (!storage) return DEFAULT_STATUS;
	const raw = storage.getItem(LICENSE_STORAGE_KEY);
	if (!raw) return DEFAULT_STATUS;
	try {
		return JSON.parse(raw) as LicenseStatus;
	} catch {
		return DEFAULT_STATUS;
	}
}

export function setLicenseStatus(status: LicenseStatus): void {
	const storage = getStorage();
	if (!storage) return;
	storage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(status));
}

/**
 * 校验 license key 格式 (离线)
 */
export function validateLicenseKeyFormat(key: string): boolean {
	const trimmed = key.trim();
	if (!trimmed.startsWith(LICENSE_KEY_PREFIX)) return false;
	const id = trimmed.slice(LICENSE_KEY_PREFIX.length);
	return /^[a-f0-9]{8}$/i.test(id);
}

/**
 * 激活 license (骨架阶段: 离线校验, Stage 7 加在线校验)
 */
export async function activateLicense(key: string): Promise<{ success: boolean; error?: string; status?: LicenseStatus }> {
	if (!validateLicenseKeyFormat(key)) {
		return { success: false, error: "license key 格式无效 (期望 yanjing-pro-{8 位 hex})" };
	}

	// Stage 7: 调用 https://yanjingai.tech/api/license/validate
	// 当前骨架: 离线校验通过即激活
	const status: LicenseStatus = {
		activated: true,
		tier: "pro",
		licenseKey: key.trim(),
		activatedAt: Date.now(),
		expiresAt: Date.now() + 365 * 24 * 3600 * 1000, // 1 年
	};
	setLicenseStatus(status);

	return { success: true, status };
}

/**
 * 停用 license
 */
export function deactivateLicense(): void {
	setLicenseStatus(DEFAULT_STATUS);
}

/**
 * 检查 Pro 权限
 */
export function isPro(): boolean {
	return getLicenseStatus().activated && getLicenseStatus().tier === "pro";
}

/**
 * 检查某 AI 功能是否需要 Pro
 */
export function isProFeature(feature: string): boolean {
	// Stage 6 决策: 哪些功能需要 Pro
	const proFeatures = [
		"ai.bilingual-captions",       // 双语字幕
		"ai.smart-chapters",           // 智能章节
		"ai.summary",                  // AI 摘要
		"ai.social-copy",              // 社媒文案
		"ai.title-generation",         // 标题生成
	];
	return proFeatures.includes(feature);
}

/**
 * 闸门: 检查 Pro 功能, 未激活抛错
 */
export function requirePro(feature: string): void {
	if (!isProFeature(feature)) return;
	if (!isPro()) {
		throw new Error(`功能 "${feature}" 需要 Pro 版。请先激活 Pro license。`);
	}
}
