/**
 * Kliq — 商业化端点配置（单一真源）
 *
 * ⚠️ 这里**不允许**出现第三方的域名/收款台。
 * 我们继承的那份草稿面板里曾硬编码 `kliq.pages.dev`（第三方）与
 * `kliq.lemonsqueezy.com/buy/kliq-pro`（第三方的 Lemon Squeezy 结算页）。
 * 那两条地址会把用户的 license 校验请求和付款导给与我们无关的一方，
 * 因此在本次落地中全部剥离，改由下面两个构建期变量注入：
 *
 *   VITE_KLQ_SITE_URL     例如 https://<你的域名>      → 校验走 {SITE}/api/license-validate
 *   VITE_KLQ_CHECKOUT_URL 例如 https://<你的店铺>.lemonsqueezy.com/checkout/buy/<产品 uuid>
 *
 * 未配置时的行为（刻意选择“宁可少功能，也不导流给第三方”）：
 *   - 校验 URL 为空 → 跳过在线校验，仅做离线格式激活
 *   - 结算 URL 为空 → “升级 Pro”按钮禁用，并在个人中心显示配置提示
 */

export const KLQ_LICENSE_KEY_PREFIX = "kliq-pro-";

/** 旧品牌前缀：迁移期仍接受，避免已在测试机上激活过的 key 失效 */
export const LEGACY_LICENSE_KEY_PREFIX = "yanjing-pro-";

/** 现行存储键 */
export const KLQ_LICENSE_STORAGE_KEY = "kliq.license.status";

/** 旧品牌存储键：只读回退，读到即迁移 */
export const LEGACY_LICENSE_STORAGE_KEYS = ["yanjing.license.status"] as const;

/** 一次性买断定价（USD） */
export const KLQ_PRO_PRICE_USD = 9.9;

const rawEnv = (import.meta.env ?? {}) as Record<string, string | undefined>;

function normalizeUrl(value: string | undefined): string {
	const trimmed = (value ?? "").trim();
	return trimmed ? trimmed.replace(/\/+$/, "") : "";
}

/** 官网/后端根地址（未配置则为空串） */
export const KLQ_SITE_URL = normalizeUrl(rawEnv.VITE_KLQ_SITE_URL);

/** license 在线校验端点（未配置则为空串 → 跳过在线校验） */
export const KLQ_LICENSE_VALIDATE_URL = KLQ_SITE_URL ? `${KLQ_SITE_URL}/api/license-validate` : "";

/** 购买 / 升级结算页（未配置则为空串 → 按钮禁用） */
export const KLQ_PRO_CHECKOUT_URL = normalizeUrl(rawEnv.VITE_KLQ_CHECKOUT_URL);

/** 退款政策页（可选） */
export const KLQ_REFUND_POLICY_URL = KLQ_SITE_URL ? `${KLQ_SITE_URL}/refund` : "";

/** 源码仓库（AGPL 3.0 要求可获取源码；沿用现有 fork 地址直到域名迁移完成） */
export const KLQ_REPO_URL = "https://github.com/yanjingai/recorder";

export function isLicenseServiceConfigured(): boolean {
	return KLQ_LICENSE_VALIDATE_URL.length > 0;
}

export function isCheckoutConfigured(): boolean {
	return KLQ_PRO_CHECKOUT_URL.length > 0;
}
