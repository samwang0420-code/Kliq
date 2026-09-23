import { Check, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import {
	buildLicenseRequestMailto,
	KLQ_LIFETIME_PRICE_USD,
	KLQ_PRO_PRICE_USD,
	KLQ_REFUND_POLICY_URL,
} from "@/lib/licenseConfig";

type CheckoutPageProps = {
	open: boolean;
	onClose: () => void;
	/** §213 极简风:仅 #22c55e 绿点状态色;按钮主体黑/白,不用 accent 染色。 */
	accent: string;
	proCheckoutUrl: string;
	isProActive: boolean;
	/** Option B Waffo Worker URL。未配置时所有购买按钮 fallback 到 proCheckoutUrl / 邮件联系(mock 模式)。 */
	workerUrl?: string;
	/** X-KLQ-Bridge-Secret header 值。mock 模式 Worker 不强制;live 模式 Worker 必校验。 */
	bridgeSecret?: string;
};

/** §213 颜色铁律: 纯黑 + 纯白 + 5 档灰阶 + 仅 #22c55e 绿点状态色 */
const C = {
	ink: "#0a0a0a",
	inkHover: "#18181b",
	paper: "#ffffff",
	g50: "#fafafa",
	g100: "#f4f4f5",
	g200: "#e4e4e7",
	g400: "#a1a1aa",
	g600: "#52525b",
	green: "#22c55e",
} as const;

const FREE_FEATURES = [
	"fullRecordlyFeatureSet",
	"screenRecordAndTimeline",
	"mp4GifWebmExport",
	"cursorAndWebcamStyling",
	"agpl30CommunitySupport",
] as const;

const PRO_FEATURES = [
	"keystrokeOverlayLosslessAudio",
	"aiTranscriptionBilingualCaptions",
	"chaptersSummariesTitlesSeoTags",
	"multiLanguageTranslationCaptionProofreading",
	"socialCopyForXhsWechatBilibili",
	"semanticSearchAcrossLongRecordings",
	"bringYourOwnApiKeyEmailSupport",
] as const;

const LIFETIME_FEATURES = [
	"smartEditOneClickNineHotwordPacks",
	"allProFeaturesPlusPrioritySupport",
	"featAllUpdatesFree",
	"featPriorityEmail",
	"featLifetimeForever",
] as const;

const FAQ_ITEMS = [
	{ qKey: "faqLifetimeQ", aKey: "faqLifetimeA" },
	{ qKey: "faqAiCostQ", aKey: "faqAiCostA" },
	{ qKey: "faqRefundQ", aKey: "faqRefundA" },
	{ qKey: "faqTeamQ", aKey: "faqTeamA" },
] as const;

/** §213: 8px 圆角统一常量 */
const RADIUS = 8;

/** §213: 120-160ms ease 动画 */
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function PriceCell({
	features,
	t,
	highlight = false,
}: {
	features: readonly string[];
	t: ReturnType<typeof useI18n>["t"];
	highlight?: boolean;
}) {
	return (
		<ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
			{features.map((feature) => (
				<li
					key={feature}
					style={{
						display: "flex",
						alignItems: "flex-start",
						gap: 10,
						padding: "8px 0",
						fontSize: 14,
						lineHeight: 1.5,
						color: highlight ? C.ink : C.g600,
					}}
				>
					<Check
						size={14}
						weight="bold"
						style={{
							color: highlight ? C.ink : C.green,
							flexShrink: 0,
							marginTop: 3,
						}}
					/>
					<span>{t(`common.yanjing.account.${feature}`, feature)}</span>
				</li>
			))}
		</ul>
	);
}

export function CheckoutPage({
	open,
	onClose,
	accent: _accent,
	proCheckoutUrl,
	isProActive,
	workerUrl,
	bridgeSecret,
}: CheckoutPageProps) {
	const { t, locale } = useI18n();
	const isZh = locale.startsWith("zh");

	const [pendingPlan, setPendingPlan] = useState<"pro" | "lifetime" | null>(null);
	const [purchaseError, setPurchaseError] = useState<string | null>(null);

	const proPrice = KLQ_PRO_PRICE_USD.toFixed(KLQ_PRO_PRICE_USD % 1 === 0 ? 0 : 1);
	const lifetimePrice = KLQ_LIFETIME_PRICE_USD.toFixed(0);

	const checkoutReady = Boolean(proCheckoutUrl);
	const mockMode = !workerUrl && !checkoutReady;

	const handleBuy = useCallback(
		async (kind: "pro" | "lifetime") => {
			setPurchaseError(null);

			// Path 1: Worker bridge (Option B / Mock mode). 真实 Waffo SDK 在 CF Workers
			// 里跑,renderer 永远拿不到 merchant private key。
			if (workerUrl) {
				const plan = kind === "lifetime" ? "lifetime" : "pro_yearly";
				setPendingPlan(kind);
				try {
					const headers: Record<string, string> = {
						"content-type": "application/json",
					};
					if (bridgeSecret) {
						headers["X-KLQ-Bridge-Secret"] = bridgeSecret;
					}
					const res = await fetch(`${workerUrl.replace(/\/$/, "")}/api/waffo/checkout`, {
						method: "POST",
						headers,
						body: JSON.stringify({ plan }),
					});
					const data = (await res.json()) as
						| { ok: true; checkoutUrl: string; mode: string }
						| { ok: false; error: { message: string } };
					if (!res.ok || !("checkoutUrl" in data)) {
						const msg =
							"error" in data && data.error
								? data.error.message
								: `Worker 返回 ${res.status}`;
						setPurchaseError(msg);
						return;
					}
					window.open(data.checkoutUrl, "_blank", "noopener");
				} catch (err) {
					setPurchaseError(err instanceof Error ? err.message : String(err));
				} finally {
					setPendingPlan(null);
				}
				return;
			}

			// Path 2: Direct Lemon Squeezy URL (legacy).
			if (checkoutReady && proCheckoutUrl) {
				window.open(proCheckoutUrl, "_blank", "noopener");
				return;
			}

			// Path 3: 邮件兜底 (mock 模式默认走这条)
			window.open(buildLicenseRequestMailto("purchase"), "_blank", "noopener");
		},
		[workerUrl, bridgeSecret, checkoutReady, proCheckoutUrl],
	);

	const handleContactSales = useCallback(() => {
		window.open(buildLicenseRequestMailto("purchase"), "_blank", "noopener");
	}, []);

	/** §213: 5 档灰阶统一通过 CSS var 引用 */
	const cssVars = useMemo(
		() =>
			({
				"--kliq-ink": C.ink,
				"--kliq-paper": C.paper,
				"--kliq-green": C.green,
			}) as React.CSSProperties,
		[],
	);

	/** 主 CTA:购买 Lifetime $99(终身版),所有方案最终默认推荐 */
	const primaryCta =
		pendingPlan === "lifetime"
			? t("common.yanjing.account.ctaOpeningCheckout", "正在打开结算页…")
			: t("common.yanjing.account.ctaBuyLifetime", "立即购买 Lifetime · ${{price}}", {
					price: lifetimePrice,
				});

	return (
		<AnimatePresence>
			{open && (
				<motion.div
					key="checkout-page-backdrop"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.15, ease: EASE_OUT }}
					style={{
						position: "fixed",
						inset: 0,
						zIndex: 60,
						display: "flex",
						alignItems: "flex-start",
						justifyContent: "center",
						overflowY: "auto",
						background: "rgba(10,10,10,0.7)",
						backdropFilter: "blur(8px)",
						WebkitBackdropFilter: "blur(8px)",
					}}
					onClick={onClose}
				>
					<motion.section
						key="checkout-page-modal"
						role="dialog"
						aria-modal="true"
						aria-label={t("common.yanjing.account.checkoutPageTitle", "选择方案")}
						initial={{ y: 24, opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						exit={{ y: 24, opacity: 0 }}
						transition={{ duration: 0.16, ease: EASE_OUT }}
						onClick={(e) => e.stopPropagation()}
						style={{
							...cssVars,
							position: "relative",
							margin: "48px auto",
							width: "min(1120px, 92vw)",
							borderRadius: RADIUS,
							border: `1px solid ${C.g200}`,
							background: C.paper,
							color: C.ink,
							boxShadow: "0 24px 64px rgba(10,10,10,0.16)",
							fontFamily:
								'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
						}}
					>
						{/* Close button — 极简: 8px 圆, hover 反色 */}
						<button
							type="button"
							onClick={onClose}
							aria-label={t("common.yanjing.account.close", "关闭")}
							style={{
								position: "absolute",
								top: 16,
								right: 16,
								zIndex: 10,
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								width: 32,
								height: 32,
								borderRadius: RADIUS,
								border: "1px solid transparent",
								background: "transparent",
								color: C.g600,
								cursor: "pointer",
								transition: "all 140ms ease",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = C.g50;
								e.currentTarget.style.color = C.ink;
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = "transparent";
								e.currentTarget.style.color = C.g600;
							}}
						>
							<X size={16} weight="bold" aria-hidden />
						</button>

						{/* Hero — section padding ≥120px (top + bottom) */}
						<header
							style={{
								padding: "120px 80px 64px",
								textAlign: "center",
								borderBottom: `1px solid ${C.g200}`,
							}}
						>
							{/* Status row:绿点 + 版本 + AGPL */}
							<div
								style={{
									display: "inline-flex",
									alignItems: "center",
									gap: 8,
									padding: "4px 10px",
									borderRadius: RADIUS,
									border: `1px solid ${C.g200}`,
									background: C.g50,
									fontSize: 12,
									color: C.g600,
									fontFamily:
										'"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
									marginBottom: 24,
								}}
							>
								<span
									style={{
										display: "inline-block",
										width: 6,
										height: 6,
										borderRadius: "50%",
										background: C.green,
									}}
									aria-hidden
								/>
								<span>Kliq · Kliq Recorder · v1.5.0 · AGPL 3.0</span>
							</div>

							<h1
								style={{
									margin: "0 auto",
									maxWidth: 880,
									fontSize: "clamp(40px, 8vw, 84px)",
									lineHeight: 0.98,
									letterSpacing: "-0.04em",
									fontWeight: 600,
									color: C.ink,
								}}
							>
								{isZh
									? t(
											"common.yanjing.account.checkoutHero",
											"让你的演示视频,变得专业。",
										)
									: t(
											"common.yanjing.account.checkoutHeroEn",
											"Make your demos look professional.",
										)}
							</h1>

							{/* 中文副标 14px 灰 */}
							<p
								style={{
									margin: "20px auto 0",
									maxWidth: 560,
									fontSize: 14,
									lineHeight: 1.5,
									color: C.g600,
								}}
							>
								{isZh
									? t(
											"common.yanjing.account.checkoutPageSubtitle",
											"一次性买断 · 永久使用 · 30 天退款 · AI 功能自带,API Key 你自己的。",
										)
									: t(
											"common.yanjing.account.checkoutPageSubtitleEn",
											"One-time · keep forever · 30-day refund · Bring your own API key.",
										)}
							</p>

							{mockMode && (
								<div
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: 8,
										marginTop: 24,
										padding: "8px 14px",
										borderRadius: RADIUS,
										border: `1px solid ${C.g200}`,
										background: C.g50,
										fontSize: 13,
										color: C.g600,
									}}
								>
									<span
										style={{
											display: "inline-block",
											width: 6,
											height: 6,
											borderRadius: "50%",
											background: C.green,
										}}
										aria-hidden
									/>
									<span>
										{t(
											"common.yanjing.account.badgeMockMode",
											"Mock 模式 · 支付集成未启用,点击购买会打开邮件申请。",
										)}
									</span>
								</div>
							)}
						</header>

						{/* 3-column pricing — 8px 圆角 1px 边框主分隔 */}
						<section
							style={{
								padding: "120px 80px",
								borderBottom: `1px solid ${C.g200}`,
							}}
						>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "repeat(3, 1fr)",
									gap: 24,
								}}
							>
								{/* Free */}
								<article
									style={{
										display: "flex",
										flexDirection: "column",
										padding: 32,
										borderRadius: RADIUS,
										border: `1px solid ${C.g200}`,
										background: C.paper,
									}}
								>
									<p
										style={{
											margin: 0,
											fontSize: 14,
											fontWeight: 500,
											color: C.g600,
										}}
									>
										{t("common.yanjing.account.planFreeName", "Free")}
									</p>
									<p
										style={{
											margin: "16px 0 0",
											fontSize: 56,
											fontWeight: 600,
											letterSpacing: "-0.03em",
											lineHeight: 1,
											color: C.ink,
											fontFamily:
												'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Noto Sans SC", sans-serif',
										}}
									>
										$0
									</p>
									<p
										style={{
											margin: "8px 0 0",
											fontSize: 13,
											color: C.g400,
										}}
									>
										{t("common.yanjing.account.planFreePrice", "Forever free")}
									</p>
									<div style={{ margin: "32px 0 24px" }}>
										<PriceCell features={FREE_FEATURES} t={t} />
									</div>
									<button
										type="button"
										onClick={onClose}
										style={{
											marginTop: "auto",
											padding: "12px 16px",
											borderRadius: RADIUS,
											border: `1px solid ${C.g200}`,
											background: C.paper,
											color: C.ink,
											fontSize: 14,
											fontWeight: 500,
											cursor: "pointer",
											transition: "all 140ms ease",
										}}
										onMouseEnter={(e) => {
											e.currentTarget.style.background = C.g50;
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.background = C.paper;
										}}
									>
										{t(
											"common.yanjing.account.ctaContinueFree",
											"Continue with Free",
										)}
									</button>
								</article>

								{/* Pro $12.9 */}
								<article
									style={{
										display: "flex",
										flexDirection: "column",
										padding: 32,
										borderRadius: RADIUS,
										border: `1px solid ${C.g200}`,
										background: C.paper,
									}}
								>
									<p
										style={{
											margin: 0,
											fontSize: 14,
											fontWeight: 500,
											color: C.g600,
										}}
									>
										{t("common.yanjing.account.planProName", "Pro")}
									</p>
									<p
										style={{
											margin: "16px 0 0",
											fontSize: 56,
											fontWeight: 600,
											letterSpacing: "-0.03em",
											lineHeight: 1,
											color: C.ink,
											display: "flex",
											alignItems: "baseline",
											gap: 6,
										}}
									>
										<span>${proPrice}</span>
										<span
											style={{
												fontSize: 14,
												fontWeight: 400,
												color: C.g400,
											}}
										>
											/year
										</span>
									</p>
									<p
										style={{
											margin: "8px 0 0",
											fontSize: 13,
											color: C.g400,
										}}
									>
										{t(
											"common.yanjing.account.planProPrice",
											"${{price}} / year",
											{
												price: proPrice,
											},
										)}
									</p>
									<p
										style={{
											margin: "32px 0 12px",
											fontSize: 12,
											color: C.g600,
											fontWeight: 500,
											textTransform: "uppercase",
											letterSpacing: "0.04em",
										}}
									>
										{t(
											"common.yanjing.account.planProIncludes",
											"Everything in Free, plus:",
										)}
									</p>
									<PriceCell features={PRO_FEATURES} t={t} />
									<button
										type="button"
										onClick={() => handleBuy("pro")}
										disabled={isProActive}
										style={{
											marginTop: 32,
											padding: "12px 16px",
											borderRadius: RADIUS,
											border: `1px solid ${C.g200}`,
											background: isProActive ? C.g50 : C.paper,
											color: C.ink,
											fontSize: 14,
											fontWeight: 500,
											cursor: isProActive ? "default" : "pointer",
											opacity: isProActive ? 0.6 : 1,
											transition: "all 140ms ease",
										}}
										onMouseEnter={(e) => {
											if (!isProActive)
												e.currentTarget.style.background = C.g50;
										}}
										onMouseLeave={(e) => {
											if (!isProActive)
												e.currentTarget.style.background = C.paper;
										}}
									>
										{isProActive
											? t("common.yanjing.license.activated", "Pro Active")
											: t(
													"common.yanjing.account.ctaBuyPro",
													"Buy Pro · ${{price}}",
													{
														price: proPrice,
													},
												)}
									</button>
								</article>

								{/* Lifetime $99 — 高亮 (黑底白字) */}
								<article
									style={{
										position: "relative",
										display: "flex",
										flexDirection: "column",
										padding: 32,
										borderRadius: RADIUS,
										border: `1px solid ${C.ink}`,
										background: C.ink,
										color: C.paper,
									}}
								>
									<div
										style={{
											position: "absolute",
											top: -10,
											left: 32,
											padding: "4px 10px",
											borderRadius: RADIUS,
											background: C.green,
											color: C.ink,
											fontSize: 11,
											fontWeight: 600,
											textTransform: "uppercase",
											letterSpacing: "0.06em",
										}}
									>
										{t(
											"common.yanjing.account.planLifetimeBadge",
											"Most popular",
										)}
									</div>
									<p
										style={{
											margin: 0,
											fontSize: 14,
											fontWeight: 500,
											color: C.paper,
										}}
									>
										{t("common.yanjing.account.planLifetimeName", "Lifetime")}
									</p>
									<p
										style={{
											margin: "16px 0 0",
											fontSize: 56,
											fontWeight: 600,
											letterSpacing: "-0.03em",
											lineHeight: 1,
											color: C.paper,
										}}
									>
										${lifetimePrice}
									</p>
									<p
										style={{
											margin: "8px 0 0",
											fontSize: 13,
											color: C.g400,
										}}
									>
										{t(
											"common.yanjing.account.planLifetimePrice",
											"${{price}} one-time · forever updates",
											{ price: lifetimePrice },
										)}
									</p>
									<p
										style={{
											margin: "32px 0 12px",
											fontSize: 12,
											color: C.g400,
											fontWeight: 500,
											textTransform: "uppercase",
											letterSpacing: "0.04em",
										}}
									>
										{t(
											"common.yanjing.account.planLifetimeIncludes",
											"Everything in Pro, plus:",
										)}
									</p>
									<div style={{ marginTop: 8 }}>
										<PriceCell
											features={LIFETIME_FEATURES}
											t={t}
											highlight={true}
										/>
									</div>
									<button
										type="button"
										onClick={() => handleBuy("lifetime")}
										disabled={pendingPlan !== null}
										style={{
											marginTop: 32,
											padding: "12px 16px",
											borderRadius: RADIUS,
											border: `1px solid ${C.paper}`,
											background: C.paper,
											color: C.ink,
											fontSize: 14,
											fontWeight: 500,
											cursor:
												pendingPlan !== null ? "not-allowed" : "pointer",
											opacity: pendingPlan !== null ? 0.6 : 1,
											transition: "all 140ms ease",
										}}
										onMouseEnter={(e) => {
											if (pendingPlan === null)
												e.currentTarget.style.background = C.g100;
										}}
										onMouseLeave={(e) => {
											if (pendingPlan === null)
												e.currentTarget.style.background = C.paper;
										}}
									>
										{pendingPlan === "lifetime"
											? t(
													"common.yanjing.account.ctaOpeningCheckout",
													"Opening checkout…",
												)
											: t(
													"common.yanjing.account.ctaBuyLifetime",
													"Buy Lifetime · ${{price}}",
													{ price: lifetimePrice },
												)}
									</button>
								</article>
							</div>
						</section>

						{/* FAQ — 原生 <details> 折叠,1px 边框主分隔 */}
						<section
							style={{
								padding: "120px 80px",
								borderBottom: `1px solid ${C.g200}`,
							}}
						>
							<h2
								style={{
									margin: 0,
									textAlign: "center",
									fontSize: 32,
									fontWeight: 600,
									letterSpacing: "-0.02em",
									color: C.ink,
								}}
							>
								{isZh ? "常见问题" : "Frequently asked"}
							</h2>
							<div
								style={{
									margin: "48px auto 0",
									maxWidth: 720,
									display: "flex",
									flexDirection: "column",
									gap: 8,
								}}
							>
								{FAQ_ITEMS.map(({ qKey, aKey }) => (
									<details
										key={qKey}
										style={{
											borderRadius: RADIUS,
											border: `1px solid ${C.g200}`,
											background: C.paper,
											padding: "16px 20px",
											transition: "background 140ms ease",
										}}
									>
										<summary
											style={{
												display: "flex",
												alignItems: "center",
												justifyContent: "space-between",
												cursor: "pointer",
												listStyle: "none",
												fontSize: 15,
												fontWeight: 500,
												color: C.ink,
											}}
										>
											<span>{t(`common.yanjing.account.${qKey}`, qKey)}</span>
											<span
												style={{
													color: C.g600,
													fontFamily:
														'"JetBrains Mono", ui-monospace, monospace',
													fontSize: 18,
													lineHeight: 1,
												}}
												className="kliq-faq-icon"
												aria-hidden
											>
												+
											</span>
										</summary>
										<p
											style={{
												margin: "12px 0 0",
												fontSize: 14,
												lineHeight: 1.6,
												color: C.g600,
											}}
										>
											{t(`common.yanjing.account.${aKey}`, aKey)}
										</p>
									</details>
								))}
							</div>
						</section>

						{/* Footer — 1 主 CTA + 1 次按钮 + 1 fineprint */}
						<footer
							style={{
								padding: "120px 80px",
								display: "flex",
								flexDirection: "column",
								alignItems: "center",
								gap: 24,
								textAlign: "center",
							}}
						>
							{purchaseError && (
								<div
									role="alert"
									style={{
										width: "100%",
										maxWidth: 520,
										padding: "10px 16px",
										borderRadius: RADIUS,
										border: `1px solid ${C.g200}`,
										background: C.g50,
										fontSize: 13,
										color: C.ink,
										textAlign: "left",
									}}
								>
									{t(
										"common.yanjing.account.purchaseErrorPrefix",
										"Couldn't open checkout:",
									)}{" "}
									{purchaseError}
								</div>
							)}

							<div
								style={{
									display: "flex",
									flexDirection: "row",
									gap: 12,
									flexWrap: "wrap",
									justifyContent: "center",
								}}
							>
								{/* 主 CTA — 黑底白字,带箭头 */}
								<button
									type="button"
									onClick={() => handleBuy("lifetime")}
									disabled={pendingPlan !== null}
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: 8,
										padding: "14px 24px",
										borderRadius: RADIUS,
										border: `1px solid ${C.ink}`,
										background: C.ink,
										color: C.paper,
										fontSize: 15,
										fontWeight: 500,
										cursor: pendingPlan !== null ? "not-allowed" : "pointer",
										opacity: pendingPlan !== null ? 0.6 : 1,
										transition: "all 140ms ease",
									}}
									onMouseEnter={(e) => {
										if (pendingPlan === null)
											e.currentTarget.style.background = C.inkHover;
									}}
									onMouseLeave={(e) => {
										if (pendingPlan === null)
											e.currentTarget.style.background = C.ink;
									}}
								>
									{primaryCta}
									<span aria-hidden>→</span>
								</button>

								{/* 次按钮 — 白底黑边,联系销售 */}
								<button
									type="button"
									onClick={handleContactSales}
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: 8,
										padding: "14px 24px",
										borderRadius: RADIUS,
										border: `1px solid ${C.g200}`,
										background: C.paper,
										color: C.ink,
										fontSize: 15,
										fontWeight: 500,
										cursor: "pointer",
										transition: "all 140ms ease",
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.background = C.g50;
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.background = C.paper;
									}}
								>
									{t(
										"common.yanjing.account.ctaContactSales",
										"Contact sales / Team license",
									)}
								</button>
							</div>

							<p
								style={{
									margin: 0,
									maxWidth: 520,
									fontSize: 12,
									lineHeight: 1.5,
									color: C.g400,
								}}
							>
								{t(
									"common.yanjing.account.paymentNote",
									"Payments handled securely by Waffo / Lemon Squeezy. We never see your card details.",
								)}
							</p>

							{KLQ_REFUND_POLICY_URL && (
								<a
									href={KLQ_REFUND_POLICY_URL}
									target="_blank"
									rel="noopener"
									style={{
										fontSize: 12,
										color: C.g600,
										textDecoration: "underline",
										textDecorationColor: C.g200,
										textUnderlineOffset: 3,
										transition: "color 140ms ease",
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.color = C.ink;
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.color = C.g600;
									}}
								>
									{t("common.yanjing.account.refundPolicy", "Refund policy")} ↗
								</a>
							)}
						</footer>
					</motion.section>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
