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
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
