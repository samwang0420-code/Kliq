import { ArrowRight, Check, Lock, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import {
	buildLicenseRequestMailto,
	KLQ_LIFETIME_PRICE_USD,
	KLQ_PRO_PRICE_USD,
	KLQ_REFUND_POLICY_URL,
} from "@/lib/licenseConfig";
import { cn } from "@/lib/utils";

type CheckoutPageProps = {
	open: boolean;
	onClose: () => void;
	/** 复用过 AccountCenterPanel 的 LIBC 调色板,避免重复定义 */
	accent: string;
	proCheckoutUrl: string;
	isProActive: boolean;
	/** Option B Waffo Worker URL。未配置时所有购买按钮 fallback 到 proCheckoutUrl / 邮件联系。 */
	workerUrl?: string;
	/** X-KLQ-Bridge-Secret header 值。mock 模式 Worker 不强制；live 模式 Worker 必校验。 */
	bridgeSecret?: string;
};

const FREE_FEATURES = [
	"fullRecordlyFeatureSet",
	"screenRecordAndTimeline",
	"mp4GifWebmExport",
	"manualSrtVttSubtitles",
	"cursorAndWebcamStyling",
	"keystrokeOverlayLosslessAudio",
	"agpl30CommunitySupport",
] as const;

const PRO_FEATURES = [
	"aiTranscriptionBilingualCaptions",
	"chaptersSummariesTitlesSeoTags",
	"multiLanguageTranslationCaptionProofreading",
	"socialCopyForXhsWechatBilibili",
	"semanticSearchAcrossLongRecordings",
	"smartEditOneClickNineHotwordPacks",
	"bringYourOwnApiKeyEmailSupport",
] as const;

const LIFETIME_FEATURES = [
	"featAllUpdatesFree",
	"featPriorityEmail",
	"featLifetimeForever",
	"featSourceBuddyDevs",
] as const;

const FAQ_ITEMS = [
	{ qKey: "faqLifetimeQ", aKey: "faqLifetimeA" },
	{ qKey: "faqAiCostQ", aKey: "faqAiCostA" },
	{ qKey: "faqRefundQ", aKey: "faqRefundQ" },
	{ qKey: "faqTeamQ", aKey: "faqTeamA" },
	{ qKey: "faqProExpireQ", aKey: "faqProExpireA" },
] as const;

function FeatureList({
	features,
	accent,
	t,
}: {
	features: readonly string[];
	accent: string;
	t: ReturnType<typeof useI18n>["t"];
}) {
	return (
		<ul className="space-y-2.5">
			{features.map((feature) => (
				<li key={feature} className="flex items-start gap-2 text-[13px] leading-relaxed">
					<Check
						size={14}
						weight="bold"
						className="mt-0.5 shrink-0"
						style={{ color: accent }}
					/>
					<span className="text-muted-foreground">{t(`common.yanjing.account.${feature}`, feature)}</span>
				</li>
			))}
		</ul>
	);
}

export function CheckoutPage({ open, onClose, accent, proCheckoutUrl, isProActive, workerUrl, bridgeSecret }: CheckoutPageProps) {
	const { t, locale } = useI18n();
	const isZh = locale.startsWith("zh");

	const [pendingPlan, setPendingPlan] = useState<"pro" | "lifetime" | null>(null);
	const [purchaseError, setPurchaseError] = useState<string | null>(null);

	const proPrice = KLQ_PRO_PRICE_USD.toFixed(KLQ_PRO_PRICE_USD % 1 === 0 ? 0 : 1);
	const lifetimePrice = KLQ_LIFETIME_PRICE_USD.toFixed(0);
	// 三条结算路径（按优先级，handleBuy 内消费）：
	//   1. workerUrl — Option B，POST /api/waffo/checkout 创建 session 后 window.open 返回的 checkoutUrl
	//   2. proCheckoutUrl — 兼容旧版 LS 直接跳转（构建期 VITE_KLQ_CHECKOUT_URL）
	//   3. mailto — 兜底邮件联系（永不失效）
	const checkoutReady = Boolean(proCheckoutUrl);

	const handleBuy = useCallback(
		async (kind: "pro" | "lifetime") => {
			setPurchaseError(null);

			// Path 1: Worker bridge (Option B). Waffo backend lives in CF Workers
			// with nodejs_compat so the renderer never sees the merchant private key.
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

			// Path 2: Direct Lemon Squeezy URL (legacy). Old LS setup used the same URL
			// for both Pro and Lifetime; the LS product page differentiates internally.
			if (checkoutReady && proCheckoutUrl) {
				window.open(proCheckoutUrl, "_blank", "noopener");
				return;
			}

			// Path 3: Fallback to email (mail-order)
			window.open(buildLicenseRequestMailto("purchase"), "_blank", "noopener");
		},
		[workerUrl, bridgeSecret, checkoutReady, proCheckoutUrl],
	);

	const handleContactSales = useCallback(() => {
		window.open(buildLicenseRequestMailto("purchase"), "_blank", "noopener");
	}, []);

	return (
		<AnimatePresence>
			{open && (
				<motion.div
					key="checkout-page-backdrop"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.16, ease: "easeOut" }}
					className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm"
					onClick={onClose}
				>
					<motion.section
						key="checkout-page-modal"
						role="dialog"
						aria-modal="true"
						aria-label={t("common.yanjing.account.checkoutPageTitle", "选择你的 Kliq 方案")}
						initial={{ y: 24, opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						exit={{ y: 24, opacity: 0 }}
						transition={{ duration: 0.18, ease: "easeOut" }}
						onClick={(e) => e.stopPropagation()}
						className={cn(
							"relative my-12 w-[960px] max-w-[92vw] rounded-2xl border border-border",
							"bg-background text-foreground shadow-2xl",
						)}
					>
						{/* Close button */}
						<button
							type="button"
							onClick={onClose}
							aria-label={t("common.yanjing.account.close", "关闭")}
							className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						>
							<X size={16} weight="bold" />
						</button>

						{/* Hero */}
						<header className="px-10 pb-10 pt-14 text-center">
							<div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground">
								<span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
								<span>Kliq · v1.5.0 · AGPL 3.0</span>
							</div>
							<h1
								className="mx-auto max-w-[760px] font-semibold tracking-tight"
								style={{
									fontSize: "clamp(48px, 7vw, 84px)",
									lineHeight: 0.98,
									letterSpacing: "-0.04em",
								}}
							>
								{isZh
									? t("common.yanjing.account.checkoutHero", "让 Kliq 帮你的演示视频变得专业")
									: t("common.yanjing.account.checkoutHeroEn", "Make your next demo beautiful.")}
							</h1>
							<p className="mx-auto mt-5 max-w-[560px] text-[14px] leading-relaxed text-muted-foreground">
								{isZh
									? t("common.yanjing.account.checkoutPageSubtitle", "一次性买断 · 永久使用 · 30 天退款")
									: t("common.yanjing.account.checkoutPageSubtitleEn", "One-time · keep forever · 30-day refund")}
							</p>

							{!checkoutReady && (
								<div
									className="mx-auto mt-6 inline-flex max-w-[520px] items-start gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-left text-[11.5px] text-muted-foreground"
								>
									<Lock size={14} className="mt-0.5 shrink-0" />
									<div>
										<p className="font-medium text-foreground/80">
											{t("common.yanjing.account.badgeMockMode", "Mock 模式 · 支付集成未启用")}
										</p>
										<p className="mt-0.5 leading-relaxed">
											{t(
												"common.yanjing.account.badgeMockModeDesc",
												"VITE_KLQ_CHECKOUT_URL 未配置,所有购买按钮指向邮件联系。配置后自动切换为 Waffo / Lemon Squeezy 在线支付。",
											)}
										</p>
									</div>
								</div>
							)}
						</header>

						{/* 3-column pricing */}
						<section className="px-10 pb-12">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
								{/* Free */}
								<article className="flex flex-col gap-5 rounded-xl border border-border bg-background p-6">
									<div>
										<p className="text-[13px] font-medium text-muted-foreground">
											{t("common.yanjing.account.planFreeName", "免费版")}
										</p>
										<p className="mt-2 text-[36px] font-semibold tracking-tight">$0</p>
										<p className="mt-1 text-[12px] text-muted-foreground">
											{t("common.yanjing.account.planFreePrice", "永久免费")}
										</p>
									</div>
									<FeatureList features={FREE_FEATURES} accent={accent} t={t} />
									<button
										type="button"
										onClick={onClose}
										className="mt-auto rounded-md border border-border bg-background px-4 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
									>
										{t("common.yanjing.account.ctaContinueFree", "继续免费版")}
									</button>
								</article>

								{/* Pro (yearly) */}
								<article className="flex flex-col gap-5 rounded-xl border border-border bg-background p-6">
									<div>
										<p className="text-[13px] font-medium text-muted-foreground">
											{t("common.yanjing.account.planProName", "Pro 版")}
										</p>
										<p className="mt-2 text-[36px] font-semibold tracking-tight">
											${proPrice}
											<span className="ml-1 text-[14px] font-normal text-muted-foreground">/year</span>
										</p>
										<p className="mt-1 text-[12px] text-muted-foreground">
											{t("common.yanjing.account.planProPrice", "${{price}} 一次性买断", {
												price: proPrice,
											})}
										</p>
									</div>
									<div className="-mx-1 flex-1 space-y-1 rounded-md px-1">
										<p className="text-[11px] font-medium text-muted-foreground">
											{t("common.yanjing.account.planProIncludes", "含免费版全部能力,另加:")}
										</p>
										<FeatureList features={PRO_FEATURES} accent={accent} t={t} />
									</div>
									<button
										type="button"
										onClick={() => handleBuy("pro")}
										disabled={isProActive}
										className={cn(
											"mt-auto inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-4 py-2.5 text-[13px] font-medium transition-colors",
											isProActive
												? "cursor-default opacity-60"
												: "hover:bg-muted",
										)}
									>
										{isProActive
											? t("common.yanjing.license.activated", "Pro 已激活")
											: t("common.yanjing.account.ctaBuyPro", "购买 Pro · ${{price}}", { price: proPrice })}
										{!isProActive && <ArrowRight size={14} weight="bold" />}
									</button>
								</article>

								{/* Lifetime (highlighted) */}
								<article
									className="relative flex flex-col gap-5 rounded-xl border-2 bg-background p-6"
									style={{ borderColor: accent }}
								>
									<div
										className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wider text-black"
										style={{ background: accent }}
									>
										{t("common.yanjing.account.planLifetimeBadge", "最受欢迎")}
									</div>
									<div>
										<p className="text-[13px] font-medium text-foreground">
											{t("common.yanjing.account.planLifetimeName", "Lifetime · 终身版")}
										</p>
										<p className="mt-2 text-[36px] font-semibold tracking-tight">${lifetimePrice}</p>
										<p className="mt-1 text-[12px] text-muted-foreground">
											{t("common.yanjing.account.planLifetimePrice", "${{price}} 一次性 · 永久免费更新", {
												price: lifetimePrice,
											})}
										</p>
									</div>
									<div className="-mx-1 flex-1 space-y-1 rounded-md px-1">
										<p className="text-[11px] font-medium text-muted-foreground">
											{t("common.yanjing.account.planLifetimeIncludes", "Pro 全部能力,另加:")}
										</p>
										<FeatureList features={LIFETIME_FEATURES} accent={accent} t={t} />
									</div>
									<button
										type="button"
										onClick={() => handleBuy("lifetime")}
										disabled={pendingPlan !== null}
										className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-md border-0 px-4 py-2.5 text-[13px] font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
										style={{ background: accent }}
									>
										{pendingPlan === "lifetime"
											? t("common.yanjing.account.ctaOpeningCheckout", "正在打开结算页…")
											: t("common.yanjing.account.ctaBuyLifetime", "立即购买 Lifetime · ${{price}}", {
													price: lifetimePrice,
												})}
										<ArrowRight size={14} weight="bold" />
									</button>
								</article>
							</div>
						</section>

						{/* FAQ */}
						<section className="border-t border-border px-10 py-12">
							<h2 className="text-center text-[24px] font-semibold tracking-tight">
								{isZh ? "常见问题" : "Frequently asked"}
							</h2>
							<div className="mx-auto mt-8 max-w-[720px] space-y-2">
								{FAQ_ITEMS.map(({ qKey, aKey }) => (
									<details
										key={qKey}
										className="group rounded-lg border border-border bg-background px-4 py-3 transition-colors hover:bg-muted/40 [&[open]]:bg-muted/40"
									>
										<summary className="flex cursor-pointer list-none items-center justify-between text-[13.5px] font-medium">
											<span>{t(`common.yanjing.account.${qKey}`, qKey)}</span>
											<span className="ml-3 inline-block transition-transform group-open:rotate-45 text-muted-foreground">+</span>
										</summary>
										<p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
											{t(`common.yanjing.account.${aKey}`, aKey)}
										</p>
									</details>
								))}
							</div>
						</section>

						{/* Footer */}
						<footer className="flex flex-col items-center gap-4 border-t border-border px-10 py-10 text-center">
							{purchaseError && (
								<div
									role="alert"
									className="w-full max-w-[520px] rounded-lg border border-red-400/60 bg-red-50 px-4 py-2 text-[12px] text-red-700"
								>
									{t(
										"common.yanjing.account.purchaseErrorPrefix",
										"打开结算页失败:",
									)}{" "}
									{purchaseError}
								</div>
							)}
							<div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
								<button
									type="button"
									onClick={() => handleBuy("lifetime")}
									disabled={pendingPlan !== null}
									className="inline-flex items-center gap-1.5 rounded-md px-5 py-2.5 text-[14px] font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
									style={{ background: accent }}
								>
									{pendingPlan === "lifetime"
										? t("common.yanjing.account.ctaOpeningCheckout", "正在打开结算页…")
										: t("common.yanjing.account.ctaBuyLifetime", "立即购买 Lifetime · ${{price}}", {
												price: lifetimePrice,
											})}
									<ArrowRight size={14} weight="bold" />
								</button>
								<button
									type="button"
									onClick={handleContactSales}
									className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-5 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
								>
									{t("common.yanjing.account.ctaContactSales", "联系销售 / 团队授权")}
								</button>
							</div>
							<p className="max-w-[520px] text-[11.5px] text-muted-foreground">
								{t(
									"common.yanjing.account.paymentNote",
									"支付由 Waffo / Lemon Squeezy 安全处理,我们不接触你的信用卡信息。",
								)}
							</p>
							{KLQ_REFUND_POLICY_URL && (
								<a
									href={KLQ_REFUND_POLICY_URL}
									target="_blank"
									rel="noopener"
									className="text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
								>
									{t("common.yanjing.account.refundPolicy", "退款政策")} ↗
								</a>
							)}
						</footer>
					</motion.section>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
