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

/** 一次性买断定价(USD) — Pro 订阅/年 */
export const KLQ_PRO_PRICE_USD = 12.9;

/** 一次性买断定价(USD) — Lifetime 永久买断(§50 新增) */
export const KLQ_LIFETIME_PRICE_USD = 99;

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

/**
 * Option B Waffo Worker 端点（Cloudflare Workers，AGENTS.md §GSPR-2）。
 * 未配置时 fallback 到 KLQ_PRO_CHECKOUT_URL 或邮件联系。Worker 自身支持 mock 模式，
 * 所以即使没有真实 Waffo merchant creds，本地 `wrangler dev --local` 也能跑通完整流程。
 */
export const KLQ_WAFFO_WORKER_URL = normalizeUrl(rawEnv.VITE_KLQ_WAFFO_WORKER_URL);

/** Worker bridge 共享密钥（X-KLQ-Bridge-Secret header）。mock 模式下 Worker 不强制；live 模式强制。 */
export const KLQ_WAFFO_BRIDGE_SECRET = (rawEnv.VITE_KLQ_WAFFO_BRIDGE_SECRET ?? "").trim();

/**
 * 源码仓库（AGPL 3.0 第 13 条要求：通过网络交互的用户必须能获取对应源码）。
 *
 * ⚠️ 这里曾误写为 `https://github.com/yanjingai/recorder` —— 那是个**不存在的仓库**，
 * 个人中心的「仓库」按钮点开必 404。全仓仓库地址以此处为**唯一真源**，其余位置一律派生。
 */
export const KLQ_REPO_URL = "https://github.com/samwang0420-code/Kliq";

/** Issue / 反馈入口（由仓库地址派生，避免出现第二个真源） */
export const KLQ_ISSUES_URL = `${KLQ_REPO_URL}/issues`;

/**
 * Lemon Squeezy 顾客订单页。
 *
 * 「我怎么再拿到我的 License key」这个问题此前**没有任何答案**：key 只在购买时
 * 发一次邮件，丢了就没了，而个人中心里也没有取回入口。
 *
 * 这个地址来自 Lemon Squeezy 官方文档（docs.lemonsqueezy.com/help/online-store/my-orders）：
 * 顾客只需填写下单邮箱，LS 会发一封魔法链接邮件把他登进去，然后能看到全部订单、
 * 附件与 License key。它是**跨店铺的全局账号**，所以不依赖我们的 store 子域。
 *
 * 这正是本仓 `KLQ_REPO_URL` 注释里记过的坑（写过一个不存在的仓库地址，按钮
 * 点开必 404）—— 所以这条地址有官方文档出处，不是编出来的。
 */
export const KLQ_STORE_ORDERS_URL = "https://app.lemonsqueezy.com/my-orders";

/**
 * 许可 / 购买相关的人工联系邮箱。
 *
 * ⚠️ 这是**渠道一致性问题**，不只是多一个常量：
 * 官网定价卡上的「购买 Pro」与「取回密钥」指向的就是这个地址
 * （见 `cloudflare/pages/index.html` 里的 `KLQ_SALES_EMAIL`），
 * 而个人中心此前**只**给 Lemon Squeezy 订单页。在店铺尚未开通、
 * 用户其实是靠邮件买到 key 的阶段，"去 Lemon Squeezy 找你的订单"
 * 只会让他看到「没有任何订单」—— 两边指的必须是同一个渠道。
 */
export const KLQ_LICENSE_REQUEST_EMAIL = "sam.wang01@icloud.com";

/**
 * 构造许可相关的人工联系链接。
 *
 * 主题固定为英文：mailto 的主题在部分客户端上对非 ASCII 的转义处理不一致，
 * 而这两个主题是给**我们自己**看的收件箱分类标记；正文由用户自己写。
 */
export function buildLicenseRequestMailto(kind: "purchase" | "recover"): string {
	const subject = kind === "purchase" ? "Kliq Pro license request" : "Kliq Pro license recover";
	return `mailto:${KLQ_LICENSE_REQUEST_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/**
 * 商业化配置自检项。
 *
 * 此前「购买入口未配置」只给一句「构建时注入 VITE_KLQ_CHECKOUT_URL 后启用」，
 * 没说全，也没说另外三个变量——而它们决定了「用户付了钱能不能激活成功」。
 * 把清单摊开，是为了让「卖不出去」这件事**可被定位到具体哪个变量没配**。
 */
export type CommercialConfigItem = {
	/** 环境变量名（原样展示，便于直接复制） */
	key: string;
	/** 从哪里配：构建期 env（应用内可见） / Cloudflare Pages 环境变量（服务端） */
	scope: "build" | "pages";
	/** 缺失时用户会看到什么 */
	effect: string;
	/** 仅 scope === "build" 可在应用内检测；pages 变量渲染进程读不到 */
	set: boolean | null;
};

export function getCommercialConfigStatus(): CommercialConfigItem[] {
	return [
		{
			key: "VITE_KLQ_SITE_URL",
			scope: "build",
			effect: "官网与许可证校验服务的根地址",
			set: KLQ_SITE_URL.length > 0,
		},
		{
			key: "VITE_KLQ_CHECKOUT_URL",
			scope: "build",
			effect: "购买按钮被禁用，用户无法付款",
			set: KLQ_PRO_CHECKOUT_URL.length > 0,
		},
		{
			key: "VITE_KLQ_WAFFO_WORKER_URL",
			scope: "build",
			effect: "Option B Worker 未配置，CheckoutPage fallback 到 LS / 邮件联系",
			set: KLQ_WAFFO_WORKER_URL.length > 0,
		},
		{
			key: "LEMON_SQUEEZY_API_KEY",
			scope: "pages",
			effect: "在线校验必失败，用户只能离线激活",
			set: null,
		},
		{
			key: "LEMON_SQUEEZY_STORE",
			scope: "pages",
			effect: "校验时无法把 key 限定到本店铺",
			set: null,
		},
		{
			key: "LEMON_SQUEEZY_PRODUCT_ID",
			scope: "pages",
			effect: "校验时无法把 key 限定到本产品",
			set: null,
		},
	];
}

/** 构建期变量里仍然缺失的那些（用于界面诊断） */
export function getMissingBuildConfigKeys(): string[] {
	return getCommercialConfigStatus()
		.filter((item) => item.scope === "build" && item.set === false)
		.map((item) => item.key);
}

export function isLicenseServiceConfigured(): boolean {
	return KLQ_LICENSE_VALIDATE_URL.length > 0;
}

export function isCheckoutConfigured(): boolean {
	return KLQ_PRO_CHECKOUT_URL.length > 0;
}
