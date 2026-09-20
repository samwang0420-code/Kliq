/**
 * Kliq — 许可证备份文件（纯逻辑）
 *
 * 为什么需要：一次性买断的产品，用户的 Pro 权限**只活在这台机器的 localStorage
 * 里**。重装系统、换机器、清浏览器数据，都会让他回到免费版 —— 而 key 只在购买
 * 时发过一封邮件。个人中心里此前没有任何「把它存下来」的办法。
 *
 * 这个模块只做**编解码与校验**，不碰文件系统、不碰 i18n、不碰 React：
 *   - 之所以拆出来，是因为本仓 vitest 是 node 环境（0 个组件测试），
 *     能被测试真正锁住的只有纯逻辑
 *   - 之所以错误用**原因码**而不是句子返回，是因为文案要出 11 种语言，
 *     句子必须在 UI 层由 i18n 生成；模块里写死中文会绕开语言包
 *
 * 安全边界（刻意的）：
 *   1. 恢复**不接受**直接写入状态，只从证书里取出 key，再走一遍 `activateLicense()`。
 *      这样伪造的文件最多等于「手动输入一个格式合法的 key」，不可能绕过在线校验。
 *   2. 文件里是明文的 license key。这不算新增暴露面（key 本来就存在 localStorage
 *      里，用户也能从个人中心复制），但界面上必须讲清楚，别让用户以为它是加密的。
 */

import { validateLicenseKeyFormat } from "./license";

export const LICENSE_BACKUP_FORMAT = "kliq-license-backup";
export const LICENSE_BACKUP_VERSION = 1;

export type LicenseBackup = {
	format: typeof LICENSE_BACKUP_FORMAT;
	version: number;
	licenseKey: string;
	/** 导出时间（ms）—— 只为人看，不参与校验 */
	exportedAt: number;
	activatedAt?: number;
	offline?: boolean;
};

/** 解析失败的原因码（UI 层据此选 i18n 文案） */
export type LicenseBackupErrorReason =
	| "notJson"
	| "notObject"
	| "wrongFormat"
	| "unsupportedVersion"
	| "invalidKey";

export type ParseLicenseBackupResult =
	| { ok: true; backup: LicenseBackup }
	| { ok: false; reason: LicenseBackupErrorReason };

export function buildLicenseBackup(input: {
	licenseKey: string;
	activatedAt?: number;
	offline?: boolean;
	now?: number;
}): LicenseBackup {
	return {
		format: LICENSE_BACKUP_FORMAT,
		version: LICENSE_BACKUP_VERSION,
		licenseKey: input.licenseKey.trim(),
		exportedAt: input.now ?? Date.now(),
		...(input.activatedAt === undefined ? {} : { activatedAt: input.activatedAt }),
		...(input.offline === undefined ? {} : { offline: input.offline }),
	};
}

/** 序列化：带缩进与尾换行，用户拿文本编辑器打开也看得懂 */
export function serializeLicenseBackup(backup: LicenseBackup): string {
	return `${JSON.stringify(backup, null, 2)}\n`;
}

export function parseLicenseBackup(raw: string): ParseLicenseBackupResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { ok: false, reason: "notJson" };
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return { ok: false, reason: "notObject" };
	}

	const candidate = parsed as Partial<LicenseBackup>;
	if (candidate.format !== LICENSE_BACKUP_FORMAT) {
		return { ok: false, reason: "wrongFormat" };
	}
	if (candidate.version !== LICENSE_BACKUP_VERSION) {
		return { ok: false, reason: "unsupportedVersion" };
	}

	const licenseKey = typeof candidate.licenseKey === "string" ? candidate.licenseKey.trim() : "";
	if (!validateLicenseKeyFormat(licenseKey)) {
		return { ok: false, reason: "invalidKey" };
	}

	return {
		ok: true,
		backup: {
			format: LICENSE_BACKUP_FORMAT,
			version: LICENSE_BACKUP_VERSION,
			licenseKey,
			exportedAt:
				typeof candidate.exportedAt === "number" && Number.isFinite(candidate.exportedAt)
					? candidate.exportedAt
					: 0,
			...(typeof candidate.activatedAt === "number"
				? { activatedAt: candidate.activatedAt }
				: {}),
			...(candidate.offline === true ? { offline: true } : {}),
		},
	};
}

/** 建议的备份文件名（日期可注入，便于测试） */
export function suggestLicenseBackupFileName(now: number = Date.now()): string {
	const date = new Date(now);
	const pad = (value: number) => String(value).padStart(2, "0");
	return `kliq-license-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}
