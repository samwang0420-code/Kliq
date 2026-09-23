/**
 * Kliq — Pro 会员 Tab (§58-2 重设计: 4 档套餐网格 + Worker 直调 + 倒计时)
 *
 * 旧版痛点 (§57 §1.1 + §58 用户反馈):
 *  - 只有 Pro / Lifetime 两档, 没有 Free / Team 对照
 *  - 用户不知道 Pro 跟 Lifetime 区别 + Team 是什么
 *  - 没有到期倒计时 (买断制无 expiry, 年订阅应有倒计时)
 *  - 视觉跟豆包 / WorkBuddy 没法比 (§213 inline 极简风)
 *
 * 新版设计 (§58-2):
 *  - 4 档套餐网格: Free / Pro $12.9/年 / Lifetime $99 / Team $39/用户/年
 *  - Team 只展示不接支付 (沿 §250 — 桌面离线 AGPL fork 不支持多人)
 *  - 主 CTA 直接调 openCheckout() (沿 §55 / §GSPR-2 Worker + LS fallback + mailto)
 *  - mock mode 顶部 banner
 *  - Pro 倒计时 (激活后 + 非 Lifetime + expiresAt 存在时显示)
 *  - License 操作 (已激活时): 复制密钥 / 备份文件 / 重新校验 / 停用
 */

import {
	ArrowRight,
	ArrowSquareOut,
	Check,
	Crown,
	Key,
	Sparkle,
	Users,
	WarningCircle,
} from "@phosphor-icons/react";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { useLicenseStatus } from "@/hooks/useLicenseStatus";
import {
	activateLicense,
	deactivateLicense,
} from "@/lib/license";
import {
	isCheckoutConfigured,
	KLQ_LIFETIME_PRICE_USD,
	KLQ_PRO_CHECKOUT_URL,
	KLQ_PRO_PRICE_USD,
	KLQ_STORE_ORDERS_URL,
	KLQ_TEAM_PRICE_USD,
	KLQ_WAFFO_BRIDGE_SECRET,
	KLQ_WAFFO_WORKER_URL,
	buildLicenseRequestMailto,
} from "@/lib/licenseConfig";
import { toast } from "@/lib/toast";

const COLORS = {
	black: "#0a0a0a",
	white: "#ffffff",
	bgPrimary: "#ffffff",
	bgSecondary: "#fafafa",
	bgTertiary: "#f4f4f5",
	border: "#e4e4e7",
	borderStrong: "#a1a1aa",
	textPrimary: "#0a0a0a",
	textSecondary: "#52525b",
	textMuted: "#a1a1aa",
	accent: "#22c55e",
	accentBg: "#22c55e1f",
	accentBorder: "#22c55e55",
	accentBgLight: "#22c55e0d",
};

const RADIUS = 8;
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

type CheckoutKind = "pro" | "lifetime";

/** 触发 Waffo Worker checkout (mock 模式直接返 checkoutUrl, live 模式走 LS) */
async function openCheckout(kind: CheckoutKind): Promise<void> {
	const workerUrl = KLQ_WAFFO_WORKER_URL;
	const secret = KLQ_WAFFO_BRIDGE_SECRET;

	if (!workerUrl) {
		if (KLQ_PRO_CHECKOUT_URL) {
			window.open(KLQ_PRO_CHECKOUT_URL, "_blank", "noopener,noreferrer");
			return;
		}
		window.location.href = buildLicenseRequestMailto("purchase");
		return;
	}

	try {
		const res = await fetch(workerUrl + "/api/waffo/checkout", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-KLQ-Bridge-Secret": secret,
			},
			body: JSON.stringify({
				plan: kind === "lifetime" ? "lifetime" : "pro",
			}),
		});
		if (!res.ok) {
			throw new Error("HTTP " + res.status);
		}
		const data = (await res.json()) as { checkoutUrl?: string };
		if (!data.checkoutUrl) {
			throw new Error("missing checkoutUrl");
		}
		window.open(data.checkoutUrl, "_blank", "noopener,noreferrer");
	} catch (err) {
		toast.error(
			"打开结算页失败:" +
				(err instanceof Error ? err.message : String(err)),
		);
	}
}

// 4 档套餐定义 (§58-2)
type Tier = {
	id: "free" | "pro" | "lifetime" | "team";
	nameKey: string;
	nameFallback: string;
	priceLabel: (price: number) => string;
	priceSubLabelKey: string;
	priceSubFallback: string;
	features: ReadonlyArray<{ key: string; fallback: string }>;
	cta?: CheckoutKind; // 暂不接 = "team"
	ctaLabelKey: string;
	ctaFallback: string;
	ctaDisabled?: boolean;
	highlight?: boolean;
};

const TIERS: ReadonlyArray<Tier> = [
	{
		id: "free",
		nameKey: "yanjing.account.tierFree",
		nameFallback: "Free",
		priceLabel: () => "$0",
		priceSubLabelKey: "yanjing.account.tierFreeSub",
		priceSubFallback: "永久 · 当前版本",
		features: [
			{ key: "yanjing.account.featRecord", fallback: "录屏 / 剪辑 / 导出" },
			{ key: "yanjing.account.featLocalOnly", fallback: "本地所有功能" },
			{ key: "yanjing.account.featNoAi", fallback: "不含 AI 转录 / 字幕" },
		],
		ctaLabelKey: "yanjing.account.ctaCurrentPlan",
		ctaFallback: "当前方案",
		ctaDisabled: true,
	},
	{
		id: "pro",
		nameKey: "yanjing.account.tierPro",
		nameFallback: "Pro",
		priceLabel: (price) => `$${price.toFixed(1)}`,
		priceSubLabelKey: "yanjing.account.tierProSub",
		priceSubFallback: "USD / 年",
		features: [
			{ key: "yanjing.account.featRecord", fallback: "录屏 / 剪辑 / 导出" },
			{ key: "yanjing.account.featAllAi", fallback: "所有 AI 转录 / 字幕 / 摘要" },
			{ key: "yanjing.account.featMultiLang", fallback: "双语字幕 / 多语言翻译" },
			{ key: "yanjing.account.featSemantic", fallback: "语义搜索长录屏" },
			{ key: "yanjing.account.feat12Month", fallback: "12 个月免费更新" },
		],
		cta: "pro",
		ctaLabelKey: "yanjing.account.ctaBuyPro",
		ctaFallback: "购买 Pro · 年付",
	},
	{
		id: "lifetime",
		nameKey: "yanjing.account.tierLifetime",
		nameFallback: "Lifetime",
		priceLabel: (price) => `$${price}`,
		priceSubLabelKey: "yanjing.account.tierLifetimeSub",
		priceSubFallback: "一次性买断 · 永久",
		features: [
			{ key: "yanjing.account.featAllAi", fallback: "所有 AI 转录 / 字幕 / 摘要" },
			{ key: "yanjing.account.featMultiLang", fallback: "双语字幕 / 多语言翻译" },
			{ key: "yanjing.account.featSemantic", fallback: "语义搜索长录屏" },
			{ key: "yanjing.account.featLifetimeUpdate", fallback: "永久免费更新所有新功能" },
			{ key: "yanjing.account.featBestValue", fallback: "性价比最高 · 一次付费终身使用" },
		],
		cta: "lifetime",
		ctaLabelKey: "yanjing.account.ctaBuyLifetime",
		ctaFallback: "购买 Lifetime · 永久",
		highlight: true,
	},
	{
		id: "team",
		nameKey: "yanjing.account.tierTeam",
		nameFallback: "Team",
		priceLabel: (price) => `$${price}`,
		priceSubLabelKey: "yanjing.account.tierTeamSub",
		priceSubFallback: "USD / 用户 / 年",
		features: [
			{ key: "yanjing.account.featAllAi", fallback: "所有 AI 功能" },
			{ key: "yanjing.account.featTeamSpace", fallback: "团队协作空间" },
			{ key: "yanjing.account.featPrioritySupport", fallback: "优先邮件支持" },
			{ key: "yanjing.account.featFutureNote", fallback: "团队版计划中 · 暂未开放" },
		],
		ctaLabelKey: "yanjing.account.ctaNotifyMe",
		ctaFallback: "暂未开放",
		ctaDisabled: true,
	},
];

// ---------- Styles ----------

const TIER_GRID_STYLE: CSSProperties = {
	display: "grid",
	gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
	gap: "12px",
};

function getTierCardStyle(tier: Tier): CSSProperties {
	if (!tier.highlight) {
		return {
			border: `1px solid ${COLORS.border}`,
			borderRadius: `${RADIUS * 1.5}px`,
			padding: "20px 16px",
			background: COLORS.bgPrimary,
			display: "flex",
			flexDirection: "column",
			gap: "12px",
			transition: "all 140ms " + EASE,
		};
	}
	return {
		border: `2px solid ${COLORS.accent}`,
		borderRadius: `${RADIUS * 1.5}px`,
		padding: "20px 16px",
		background: COLORS.bgPrimary,
		display: "flex",
			flexDirection: "column",
		gap: "12px",
		position: "relative",
		transition: "all 140ms " + EASE,
	};
}

const TIER_NAME_STYLE: CSSProperties = {
	margin: 0,
	fontSize: "15px",
	fontWeight: 600,
	letterSpacing: "-0.01em",
	color: COLORS.textPrimary,
	display: "flex",
	alignItems: "center",
	gap: "6px",
};

const TIER_PRICE_STYLE: CSSProperties = {
	fontSize: "28px",
	fontWeight: 700,
	letterSpacing: "-0.03em",
	color: COLORS.textPrimary,
	lineHeight: 1,
};

const TIER_PRICE_SUB_STYLE: CSSProperties = {
	marginTop: "2px",
	fontSize: "12px",
	color: COLORS.textMuted,
};

const TIER_FEATURE_LIST_STYLE: CSSProperties = {
	listStyle: "none",
	margin: 0,
	padding: 0,
	display: "flex",
	flexDirection: "column",
	gap: "8px",
	fontSize: "12px",
	color: COLORS.textSecondary,
	lineHeight: 1.5,
};

const TIER_CTA_STYLE: CSSProperties = {
	marginTop: "auto",
	padding: "10px 14px",
	fontSize: "12px",
	fontWeight: 600,
	borderRadius: `${RADIUS}px`,
	border: `1px solid ${COLORS.border}`,
	background: COLORS.bgPrimary,
	color: COLORS.textPrimary,
	cursor: "pointer",
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	gap: "6px",
	transition: "all 140ms " + EASE,
	fontFamily: "inherit",
};

const TIER_CTA_HIGHLIGHT_STYLE: CSSProperties = {
	marginTop: "auto",
	padding: "10px 14px",
	fontSize: "12px",
	fontWeight: 600,
	borderRadius: `${RADIUS}px`,
	border: `1px solid ${COLORS.accent}`,
	background: COLORS.accent,
	color: COLORS.black,
	cursor: "pointer",
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	gap: "6px",
	transition: "all 140ms " + EASE,
	fontFamily: "inherit",
};

const TIER_CTA_DISABLED_STYLE: CSSProperties = {
	marginTop: "auto",
	padding: "10px 14px",
	fontSize: "12px",
	fontWeight: 500,
	borderRadius: `${RADIUS}px`,
	border: `1px solid ${COLORS.border}`,
	background: COLORS.bgSecondary,
	color: COLORS.textMuted,
	cursor: "not-allowed",
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	gap: "6px",
	fontFamily: "inherit",
};

const HIGHLIGHT_BADGE_STYLE: CSSProperties = {
	position: "absolute",
	top: "-10px",
	left: "50%",
	transform: "translateX(-50%)",
	background: COLORS.accent,
	color: COLORS.black,
	padding: "2px 10px",
	borderRadius: "999px",
	fontSize: "10px",
	fontWeight: 700,
	letterSpacing: "0.04em",
	whiteSpace: "nowrap",
};

const MOCK_BANNER_STYLE: CSSProperties = {
	padding: "12px 16px",
	borderRadius: `${RADIUS}px`,
	border: `1px solid ${COLORS.border}`,
	background: COLORS.bgSecondary,
	fontSize: "13px",
	lineHeight: 1.5,
	display: "flex",
	alignItems: "flex-start",
	gap: "10px",
};

const COUNTDOWN_BANNER_STYLE: CSSProperties = {
	padding: "16px 20px",
	borderRadius: `${RADIUS}px`,
	border: `1px solid ${COLORS.accentBorder}`,
	background: COLORS.accentBgLight,
	fontSize: "13px",
	lineHeight: 1.5,
	display: "flex",
	alignItems: "center",
	gap: "12px",
	marginBottom: "16px",
};

const ACTION_BTN_STYLE: CSSProperties = {
	padding: "8px 14px",
	fontSize: "12px",
	fontWeight: 500,
	borderRadius: `${RADIUS}px`,
	border: `1px solid ${COLORS.border}`,
	background: COLORS.bgPrimary,
	color: COLORS.textPrimary,
	cursor: "pointer",
	display: "inline-flex",
	alignItems: "center",
	gap: "6px",
	transition: "all 140ms " + EASE,
	fontFamily: "inherit",
};

// ---------- Component ----------

function formatCountdown(expiresAt: number, now: number): string {
	const ms = expiresAt - now;
	if (ms <= 0) return "已到期";
	const days = Math.floor(ms / 86400000);
	const hours = Math.floor((ms % 86400000) / 3600000);
	if (days > 0) return `${days} 天 ${hours} 小时`;
	return `${hours} 小时`;
}

export function ProTab(): ReactNode {
	const t = useScopedT("common");
	const status = useLicenseStatus();
	const isProActive = status.activated && status.tier === "pro";
	const isLifetime = isProActive && !status.expiresAt;

	// 倒计时 tick (§58-2)
	const [now, setNow] = useState<number>(() => Date.now());
	useEffect(() => {
		if (!isProActive || isLifetime || !status.expiresAt) return;
		const id = window.setInterval(() => setNow(Date.now()), 60_000);
		return () => window.clearInterval(id);
	}, [isProActive, isLifetime, status.expiresAt]);

	const checkoutConfigured = isCheckoutConfigured();
	const workerConfigured = KLQ_WAFFO_WORKER_URL.length > 0;
	const isMockMode = !checkoutConfigured && !workerConfigured;

	const handleUpgrade = useCallback((kind: CheckoutKind) => {
		void openCheckout(kind);
	}, []);

	const handleManageSubscription = useCallback(() => {
		if (KLQ_STORE_ORDERS_URL) {
			window.open(KLQ_STORE_ORDERS_URL, "_blank", "noopener,noreferrer");
		}
	}, []);

	const handleDeactivate = useCallback(() => {
		deactivateLicense();
		toast.success(t("yanjing.license.deactivated", "License 已停用"));
	}, [t]);

	const handleRevalidate = useCallback(async () => {
		const key = status.licenseKey;
		if (!key) return;
		const result = await activateLicense(key);
		if (!result.success) {
			toast.error(
				result.error ?? t("yanjing.account.revalidateFail", "校验失败"),
			);
			return;
		}
		if (result.notice) {
			toast.warning(
				t(
					"yanjing.account.revalidateOffline",
					"校验服务不可用，仍为离线状态",
				),
			);
			return;
		}
		toast.success(
			t("yanjing.account.revalidateOk", "已与服务器确认，Pro 状态已更新"),
		);
	}, [status.licenseKey, t]);

	// ----- 已激活视图 -----
	if (isProActive) {
		return (
			<div>
				{/* Mock mode banner (即使已激活也显示, 提醒用户当前 checkout 模式) */}
				{isMockMode && (
					<div style={MOCK_BANNER_STYLE}>
						<WarningCircle size={14} weight="bold" style={{ marginTop: 2, flexShrink: 0 }} />
						<div>
							<p style={{ margin: 0, fontWeight: 600 }}>
								{t("yanjing.pro.checkoutStatusMock", "Mock 模式 · 支付集成未启用")}
							</p>
							<p style={{ margin: "4px 0 0 0", color: COLORS.textSecondary }}>
								{t(
									"yanjing.badgeMockModeDesc",
									"VITE_KLQ_CHECKOUT_URL 未配置,所有购买按钮指向邮件联系。配置后自动切换为 Waffo / Lemon Squeezy 在线支付。",
								)}
							</p>
						</div>
					</div>
				)}

				{/* Pro 状态卡 */}
				<div
					style={{
						padding: "20px 24px",
						borderRadius: `${RADIUS * 1.5}px`,
						border: `1px solid ${COLORS.accentBorder}`,
						background: COLORS.accentBgLight,
						display: "flex",
						alignItems: "flex-start",
						justifyContent: "space-between",
						gap: "16px",
						marginBottom: "20px",
						marginTop: "16px",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
						<Crown size={28} weight="duotone" style={{ color: COLORS.accent }} />
						<div>
							<h2 style={{ margin: 0, fontSize: "17px", fontWeight: 600, color: COLORS.textPrimary }}>
								{t("yanjing.account.tabPro", "Pro 会员")}
							</h2>
							<p style={{ margin: "2px 0 0 0", fontSize: "12px", color: COLORS.textSecondary }}>
								{isLifetime
									? t("yanjing.account.subscriptionPermanent", "永久使用")
									: t("yanjing.account.subscriptionYearly", "年订阅")}
								{status.activatedAt && (
									<>
										{" · "}
										{t("yanjing.pro.activatedOn", "激活于 {{ date }}", {
											date: new Date(status.activatedAt).toLocaleDateString(),
										})}
									</>
								)}
							</p>
						</div>
					</div>
					<span
						style={{
							background: COLORS.accentBg,
							color: COLORS.accent,
							borderRadius: "999px",
							padding: "4px 10px",
							fontSize: "11px",
							fontWeight: 700,
							letterSpacing: "0.04em",
							whiteSpace: "nowrap",
						}}
					>
						{isLifetime
							? t("yanjing.pro.lifetimeLabel", "Lifetime · 永久")
							: t("yanjing.pro.yearlyLabel", "Pro · 年订阅")}
					</span>
				</div>

				{/* 倒计时 banner (仅 Pro 年订阅 + 有 expiresAt) */}
				{!isLifetime && status.expiresAt && (
					<div style={COUNTDOWN_BANNER_STYLE}>
						<span
							style={{
								width: "8px",
								height: "8px",
								borderRadius: "999px",
								background: COLORS.accent,
								flexShrink: 0,
							}}
						/>
						<div style={{ flex: 1 }}>
							<p style={{ margin: 0, fontWeight: 600, color: COLORS.textPrimary }}>
								{t("yanjing.pro.expiryTitle", "Pro 到期")}
							</p>
							<p style={{ margin: "2px 0 0 0", fontSize: "12px", color: COLORS.textSecondary }}>
								{t(
									"yanjing.pro.expiryBody",
									"{{date}} · 剩余 {{remain}}",
									{
										date: new Date(status.expiresAt).toLocaleString(),
										remain: formatCountdown(status.expiresAt, now),
									},
								)}
							</p>
						</div>
					</div>
				)}

				{/* 续费 / 管理 */}
				{!isLifetime && (
					<button
						type="button"
						onClick={handleManageSubscription}
						style={{
							...ACTION_BTN_STYLE,
							marginBottom: "16px",
						}}
					>
						{t("yanjing.account.ctaManageSubscription", "续费 / 管理订阅")}
						<ArrowSquareOut size={11} />
					</button>
				)}

				{/* License 操作 */}
				<div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
					<button
						type="button"
						onClick={handleRevalidate}
						style={ACTION_BTN_STYLE}
					>
						{t("yanjing.account.ctaRevalidate", "重新校验")}
					</button>
					<button
						type="button"
						onClick={handleDeactivate}
						style={ACTION_BTN_STYLE}
					>
						{t("yanjing.license.deactivate", "停用")}
					</button>
				</div>
			</div>
		);
	}

	// ----- 未激活视图: 4 档套餐 -----
	return (
		<div>
			{isMockMode && (
				<div style={{ ...MOCK_BANNER_STYLE, marginBottom: "20px" }}>
					<WarningCircle size={14} weight="bold" style={{ marginTop: 2, flexShrink: 0 }} />
					<div>
						<p style={{ margin: 0, fontWeight: 600 }}>
							{t("yanjing.pro.checkoutStatusMock", "Mock 模式 · 支付集成未启用")}
						</p>
						<p style={{ margin: "4px 0 0 0", color: COLORS.textSecondary }}>
							{t(
								"yanjing.badgeMockModeDesc",
								"VITE_KLQ_CHECKOUT_URL 未配置,所有购买按钮指向邮件联系。配置后自动切换为 Waffo / Lemon Squeezy 在线支付。",
							)}
						</p>
					</div>
				</div>
			)}

			<div style={TIER_GRID_STYLE}>
				{TIERS.map((tier) => {
					const price = tier.id === "pro" ? KLQ_PRO_PRICE_USD : tier.id === "lifetime" ? KLQ_LIFETIME_PRICE_USD : KLQ_TEAM_PRICE_USD;
					const cardStyle = getTierCardStyle(tier);
					const ctaStyle = tier.highlight
						? TIER_CTA_HIGHLIGHT_STYLE
						: tier.ctaDisabled
							? TIER_CTA_DISABLED_STYLE
							: TIER_CTA_STYLE;
					return (
						<div key={tier.id} style={cardStyle}>
							{tier.highlight && (
								<span style={HIGHLIGHT_BADGE_STYLE}>
									{t("yanjing.account.badgeBestValue", "最佳价值")}
								</span>
							)}
							<h3 style={TIER_NAME_STYLE}>
								{tier.id === "team" ? <Users size={15} weight="duotone" /> : tier.id === "lifetime" ? <Crown size={15} weight="duotone" /> : <Sparkle size={15} weight="duotone" />}
								{t(tier.nameKey, tier.nameFallback)}
							</h3>
							<div>
								<div style={TIER_PRICE_STYLE}>{tier.priceLabel(price)}</div>
								<div style={TIER_PRICE_SUB_STYLE}>
									{t(tier.priceSubLabelKey, tier.priceSubFallback)}
								</div>
							</div>
							<ul style={TIER_FEATURE_LIST_STYLE}>
								{tier.features.map((feat, idx) => (
									<li key={idx} style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
										<Check
											size={12}
											weight="bold"
											style={{ color: tier.highlight ? COLORS.accent : COLORS.textMuted, marginTop: 3, flexShrink: 0 }}
										/>
										<span>{t(feat.key, feat.fallback)}</span>
									</li>
								))}
							</ul>
							<button
								type="button"
								onClick={() => tier.cta && handleUpgrade(tier.cta)}
								disabled={tier.ctaDisabled}
								style={ctaStyle}
								onMouseEnter={(event) => {
									if (tier.ctaDisabled) return;
									if (tier.highlight) {
										event.currentTarget.style.opacity = "0.9";
									} else {
										event.currentTarget.style.background = COLORS.bgSecondary;
									}
								}}
								onMouseLeave={(event) => {
									if (tier.ctaDisabled) return;
									if (tier.highlight) {
										event.currentTarget.style.opacity = "1";
									} else {
										event.currentTarget.style.background = COLORS.bgPrimary;
									}
								}}
							>
								{tier.id === "lifetime" && <Key size={12} />}
								{tier.cta && <ArrowRight size={11} />}
								{t(tier.ctaLabelKey, tier.ctaFallback)}
							</button>
						</div>
					);
				})}
			</div>

			{/* FAQ 提示 */}
			<div style={{ marginTop: "20px", fontSize: "11px", color: COLORS.textMuted, lineHeight: 1.5 }}>
				{t(
					"yanjing.account.tierFootnote",
					"所有 AI 功能调用你自己的 OpenAI / DeepSeek API · Kliq 不收 AI 用量费 · 30 天无理由退款",
				)}
			</div>
		</div>
	);
}

export default ProTab;
