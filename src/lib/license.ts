/**
 * Kliq — 许可证 / Pro 权益模块
 *
 * 商业模式(用户拍板):**一次性买断**,Pro 订阅/年 $12.9 / Lifetime 永久 $99。
 *   购买：Lemon Squeezy 结算页（URL 见 licenseConfig.ts，构建期注入）
 *   交付：用户拿到 license key → 在「个人中心」激活
 *
 * 激活流程：
 *   1. 本地格式校验（`kliq-pro-` + 8 位 hex，兼容旧前缀 `yanjing-pro-`）
 *   2. 在线校验（{SITE}/api/license-validate）拿到权威到期时间
 *      - 网络不可用 / 未配置校验服务 → 回退为离线激活（标记 offline: true）
 *      - 服务端明确判为无效（4xx 且非 404）→ 激活失败
 *   3. 成功后写入本地存储，并通知订阅者刷新 UI
 *
 * 存储：
 *   - 现行键 `kliq.license.status`
 *   - 旧品牌键 `yanjing.license.status` 只读回退，读到即迁移到新键
 */

import {
	isLicenseServiceConfigured,
	KLQ_LICENSE_KEY_PREFIX,
	KLQ_LICENSE_STORAGE_KEY,
	KLQ_LICENSE_VALIDATE_URL,
	LEGACY_LICENSE_KEY_PREFIX,
	LEGACY_LICENSE_STORAGE_KEYS,
} from "./licenseConfig";

export type LicenseTier = "free" | "pro";

export type LicenseStatus = {
	activated: boolean;
	tier: LicenseTier;
	/** 一次性买断：正常情况下为 undefined（永久有效） */
	expiresAt?: number;
	licenseKey?: string;
	activatedAt?: number;
	/** true 表示仅通过离线格式校验激活，未与后端确认过 */
	offline?: boolean;
};

export type ActivateResult = {
	success: boolean;
	status?: LicenseStatus;
	error?: string;
	/** 面向用户的提示（例如“在线校验不可用，已离线激活”） */
	notice?: string;
};

const DEFAULT_STATUS: LicenseStatus = {
	activated: false,
	tier: "free",
};

/**
 * Pro 权益分组（用于个人中心的权益清单与闸门提示文案）。
 * 分组而非逐动作列出，是为了让 12 个语言包各只维护 6 条文案。
 */
export const PRO_FEATURES = [
	"transcribe",
	"captions",
	"generate",
	"search",
	"proofread",
	"edit",
] as const;

export type ProFeature = (typeof PRO_FEATURES)[number];

const PRO_FEATURE_SET = new Set<string>(PRO_FEATURES);

/**
 * 免费能力分组（个人中心「Free / Pro 对照表」的左栏）。
 *
 * 为什么要有它：此前个人中心只列 Pro 有什么，用户没法判断值不值得买 ——
 * 而这恰恰是「怎么收费」最核心的一句话。左栏必须来自代码里的**事实**，
 * 不是营销文案：这些能力确实无一调用付费 API。
 */
export const FREE_FEATURES = [
	"recording",
	"editing",
	"localCleanup",
	"annotate",
	"exporting",
	"privacy",
] as const;

export type FreeFeature = (typeof FREE_FEATURES)[number];

/**
 * 保持免费的 AI 动作：全部在本地跑启发式算法（静音检测 / 填充词识别 /
 * 语速分析 / 人脸跟随），不产生任何 API 成本，因此没有收费理由。
 */
export const FREE_AI_ACTIONS = ["ai-silence", "ai-fillers", "ai-speed", "ai-zoom"] as const;

/** 该动作是否免费（与 actionRequiresPro 互斥、互补） */
export function isFreeAction(actionId: string): boolean {
	return !actionRequiresPro(actionId);
}

/**
 * AI 工具栏动作 → Pro 权益分组。
 * 未列出的动作（去静音 / 去填充词 / 智能加速 / 自动取景）保持免费：
 * 它们在本地启发式完成，不产生 API 成本，作为免费版的可感知价值。
 */
export const ACTION_TO_PRO_FEATURE: Record<string, ProFeature> = {
	transcribe: "transcribe",
	"bilingual-captions": "captions",
	"ai-translate-multi": "captions",
	"ai-chapters": "generate",
	"ai-summary": "generate",
	"ai-titles": "generate",
	"ai-tags": "generate",
	"ai-social": "generate",
	"ai-semantic-search": "search",
	"ai-proofread": "proofread",
	"ai-oneclick": "edit",
	"ai-ui-polish": "edit",
};

/** 未激活 Pro 时被拦截时抛出的错误，UI 据此弹出升级面板 */
export class ProRequiredError extends Error {
	readonly feature: string;
	constructor(feature: string) {
		super(`Pro required: ${feature}`);
		this.name = "ProRequiredError";
		this.feature = feature;
	}
}

// ---------------------------------------------------------------- storage

type StorageLike = {
	getItem: (key: string) => string | null;
	setItem: (key: string, value: string) => void;
};

function getStorage(): StorageLike | null {
	try {
		if (typeof window === "undefined" || !window.localStorage) return null;
		return window.localStorage as unknown as StorageLike;
	} catch {
		return null;
	}
}

function parseStatus(raw: string | null): LicenseStatus | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<LicenseStatus>;
		const tier: LicenseTier = parsed.tier === "pro" ? "pro" : "free";
		return {
			activated: Boolean(parsed.activated) && tier === "pro",
			tier,
			expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : undefined,
			licenseKey: typeof parsed.licenseKey === "string" ? parsed.licenseKey : undefined,
			activatedAt: typeof parsed.activatedAt === "number" ? parsed.activatedAt : undefined,
			offline: parsed.offline === true,
		};
	} catch {
		return null;
	}
}

/** 读取许可状态（含旧键迁移） */
export function getLicenseStatus(): LicenseStatus {
	const storage = getStorage();
	if (!storage) return DEFAULT_STATUS;

	const current = parseStatus(storage.getItem(KLQ_LICENSE_STORAGE_KEY));
	if (current) return current;

	for (const legacyKey of LEGACY_LICENSE_STORAGE_KEYS) {
		const legacy = parseStatus(storage.getItem(legacyKey));
		if (legacy) {
			storage.setItem(KLQ_LICENSE_STORAGE_KEY, JSON.stringify(legacy));
			return legacy;
		}
	}
	return DEFAULT_STATUS;
}

const listeners = new Set<(status: LicenseStatus) => void>();

/** 订阅许可状态变化（个人中心 / AI 工具栏共用） */
export function subscribeLicense(listener: (status: LicenseStatus) => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function emit(status: LicenseStatus): void {
	for (const listener of listeners) {
		try {
			listener(status);
		} catch {
			// 单个订阅者异常不应影响其它订阅者
		}
	}
}

export function setLicenseStatus(status: LicenseStatus): void {
	const storage = getStorage();
	if (storage) {
		storage.setItem(KLQ_LICENSE_STORAGE_KEY, JSON.stringify(status));
	}
	emit(status);
}

// ---------------------------------------------------------------- format

/** 本地格式校验：`kliq-pro-XXXXXXXX`（兼容旧前缀） */
export function validateLicenseKeyFormat(key: string): boolean {
	const trimmed = key.trim();
	const prefix = trimmed.startsWith(KLQ_LICENSE_KEY_PREFIX)
		? KLQ_LICENSE_KEY_PREFIX
		: trimmed.startsWith(LEGACY_LICENSE_KEY_PREFIX)
			? LEGACY_LICENSE_KEY_PREFIX
			: null;
	if (!prefix) return false;
	return /^[a-f0-9]{8}$/i.test(trimmed.slice(prefix.length));
}

/** key 的展示脱敏：kliq-pro-ab12**** */
export function maskLicenseKey(key: string): string {
	if (key.length <= 12) return key;
	return `${key.slice(0, 12)}****`;
}

// ---------------------------------------------------------------- activation

/**
 * 在线校验应答（与 functions/api/license-validate.ts 的契约保持一致）。
 *
 * 注意 `valid` 与 HTTP 状态码是**两件事**：Pages Function 对「key 格式不对」返回
 * 4xx，但对「格式对、Lemon Squeezy 判定无效」会返回 200 + `{ valid: false }`。
 * 若只看 `res.ok` 就会把无效 key 当成激活成功 —— 所以这里必须显式判 `valid`。
 */
type ServerValidation = {
	valid?: boolean;
	expiresAt?: number | null;
	activatedAt?: number | null;
	error?: string;
};

type OnlineResult =
	| { kind: "ok"; data: ServerValidation }
	| { kind: "invalid"; message?: string }
	| { kind: "unavailable"; message?: string };

async function validateOnline(key: string): Promise<OnlineResult> {
	if (!isLicenseServiceConfigured()) {
		return { kind: "unavailable", message: "license service not configured" };
	}
	try {
		const res = await fetch(KLQ_LICENSE_VALIDATE_URL, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ licenseKey: key }),
		});
		if (res.ok) {
			const data = (await res.json()) as ServerValidation;
			// 服务端在 200 里明确否认 → 判定无效，绝不落盘为已激活
			if (data.valid === false) {
				return { kind: "invalid", message: data.error ?? "server rejected the key" };
			}
			return { kind: "ok", data };
		}
		// 404 = 校验端点本身不存在（站点未部署 / 路由缺失）→ 回退离线激活。
		// 「上游说不存在」的 404 已被 Pages Function 转成 200 + valid:false，
		// 不会走到这里 —— 两种 404 的分工见 functions/api/license-validate.ts。
		if (res.status === 404) {
			return { kind: "unavailable", message: `HTTP ${res.status}` };
		}
		// 503 = 上游 Lemon Squeezy 故障：不是这把 key 的错，
		// 降级离线激活，联网后可重新校验；判成 invalid 会错杀真 key。
		if (res.status === 503) {
			return { kind: "unavailable", message: `HTTP ${res.status}` };
		}
		return { kind: "invalid", message: `HTTP ${res.status}` };
	} catch (error) {
		return { kind: "unavailable", message: (error as Error).message };
	}
}

/** 激活 license。在线校验优先，不可用时回退离线激活。 */
export async function activateLicense(key: string): Promise<ActivateResult> {
	const trimmed = key.trim();
	if (!validateLicenseKeyFormat(trimmed)) {
		return {
			success: false,
			error: `License key 格式无效（期望 ${KLQ_LICENSE_KEY_PREFIX}{8 位 hex}）`,
		};
	}

	const online = await validateOnline(trimmed);

	if (online.kind === "invalid") {
		return { success: false, error: `License key 无效（${online.message ?? "校验未通过"}）` };
	}

	const now = Date.now();
	if (online.kind === "ok") {
		const status: LicenseStatus = {
			activated: true,
			tier: "pro",
			licenseKey: trimmed,
			activatedAt: online.data.activatedAt ?? now,
			// 一次性买断：后端未给 expiresAt 即视为永久
			expiresAt: online.data.expiresAt ?? undefined,
			offline: false,
		};
		setLicenseStatus(status);
		return { success: true, status };
	}

	const status: LicenseStatus = {
		activated: true,
		tier: "pro",
		licenseKey: trimmed,
		activatedAt: now,
		offline: true,
	};
	setLicenseStatus(status);
	return {
		success: true,
		status,
		notice: isLicenseServiceConfigured()
			? "校验服务暂不可用，已离线激活（联网后可重新激活以确认）"
			: "未配置在线校验服务，已离线激活",
	};
}

export function deactivateLicense(): void {
	const storage = getStorage();
	if (storage) {
		storage.setItem(KLQ_LICENSE_STORAGE_KEY, JSON.stringify(DEFAULT_STATUS));
	}
	emit(DEFAULT_STATUS);
}

// ---------------------------------------------------------------- entitlement

export function isPro(): boolean {
	const status = getLicenseStatus();
	return status.activated && status.tier === "pro";
}

export function isProFeature(feature: string): boolean {
	return PRO_FEATURE_SET.has(feature);
}

/** 查询某个动作/功能是否被放行（不抛错，供 UI 展示锁标） */
export function canUseFeature(feature: string): boolean {
	return !isProFeature(feature) || isPro();
}

/** 闸门：未激活 Pro 时抛 ProRequiredError */
export function requirePro(feature: string): void {
	if (canUseFeature(feature)) return;
	throw new ProRequiredError(feature);
}

/** AI 动作 id → 是否需要 Pro */
export function actionRequiresPro(actionId: string): boolean {
	return Boolean(ACTION_TO_PRO_FEATURE[actionId]);
}

/** AI 动作 id → Pro 功能 id（免费动作为 undefined） */
export function proFeatureForAction(actionId: string): ProFeature | undefined {
	return ACTION_TO_PRO_FEATURE[actionId];
}
