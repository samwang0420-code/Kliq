/// <reference types="vite/client" />
/// <reference types="../electron/electron-env" />

/**
 * 构建期注入的环境变量（必须带 VITE_ 前缀才会进前端 bundle）。
 * 收费闸口相关端点见 src/lib/licenseConfig.ts，样例见 .env.example。
 */
interface ImportMetaEnv {
	/** 自有站点地址；配置后启用在线校验（${SITE}/api/license-validate） */
	readonly VITE_KLQ_SITE_URL?: string;
	/** Lemon Squeezy 结算页 URL；未配置时个人中心的购买按钮禁用 */
	readonly VITE_KLQ_CHECKOUT_URL?: string;
	/** Waffo Worker URL（Cloudflare Workers，Option B 架构）。配置后 CheckoutPage
	 *  改为调 POST /api/waffo/checkout 拿到真实 session URL 后 window.open。
	 *  未配置时所有购买按钮 fallback 到 VITE_KLQ_CHECKOUT_URL 或邮件联系。 */
	readonly VITE_KLQ_WAFFO_WORKER_URL?: string;
	/** Worker bridge 共享密钥（Electron app 调 Worker 时作为 X-KLQ-Bridge-Secret header）。
	 *  mock 模式下可选；live 模式下 Worker 强制要求。 */
	readonly VITE_KLQ_WAFFO_BRIDGE_SECRET?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
