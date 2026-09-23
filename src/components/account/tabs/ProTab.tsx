import {
	ArrowRight,
	ArrowSquareOut,
	Check,
	Crown,
	Key,
	Sparkle,
	WarningCircle,
} from "@phosphor-icons/react";
import { type ReactNode, useCallback } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { useLicenseStatus } from "@/hooks/useLicenseStatus";
import {
	isCheckoutConfigured,
	KLQ_LIFETIME_PRICE_USD,
	KLQ_PRO_CHECKOUT_URL,
	KLQ_PRO_PRICE_USD,
	KLQ_STORE_ORDERS_URL,
	KLQ_WAFFO_BRIDGE_SECRET,
	KLQ_WAFFO_WORKER_URL,
	buildLicenseRequestMailto,
} from "@/lib/licenseConfig";
import { toast } from "@/lib/toast";

const ACCENT = "#22c55e";
const ACCENT_BG = ACCENT + "1f";
const ACCENT_BORDER = ACCENT + "55";
const ACCENT_BG_LIGHT = ACCENT + "0d";

const PRO_FEATURES: ReadonlyArray<{
	icon: typeof Sparkle;
	key: string;
	fallback: string;
}> = [
	{
		icon: Sparkle,
		key: "yanjing.license.feature.transcribe",
		fallback: "AI 转录（语音转文字）",
	},
	{
		icon: Sparkle,
		key: "yanjing.license.feature.captions",
		fallback: "双语字幕与多语言翻译",
	},
	{
		icon: Sparkle,
		key: "yanjing.license.feature.generate",
		fallback: "摘要 / 章节 / 标题 / 标签 / 社媒文案",
	},
	{
		icon: Sparkle,
		key: "yanjing.license.feature.search",
		fallback: "语义搜索（长录屏秒级定位）",
	},
	{
		icon: Sparkle,
		key: "yanjing.license.feature.proofread",
		fallback: "字幕 AI 校对",
	},
	{
		icon: Sparkle,
		key: "yanjing.license.feature.edit",
		fallback: "一键智能剪辑与文案润色",
	},
];

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

export function ProTab(): ReactNode {
	const t = useScopedT("common");
	const status = useLicenseStatus();
	const isProActive = status.activated && status.tier === "pro";

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

	// Pro 状态卡
	if (isProActive) {
		return (
			<div className="space-y-6">
				<section
					className="rounded-lg border px-5 py-5"
					style={{ borderColor: ACCENT_BORDER, background: ACCENT_BG_LIGHT }}
				>
					<div className="flex items-start justify-between gap-3">
						<div className="flex items-center gap-3">
							<Crown size={28} weight="duotone" style={{ color: ACCENT }} />
							<div>
								<h2 className="text-lg font-semibold tracking-tight">
									{t("yanjing.account.tabPro", "Pro 会员")}
								</h2>
								<p className="mt-0.5 text-xs text-muted-foreground">
									{t(
										"yanjing.account.subscriptionPermanent",
										"永久使用",
									)}
									{status.activatedAt && (
										<>
											{" · "}
											{t(
												"yanjing.pro.activatedOn",
												"激活于 {{ date }}",
												{
													date: new Date(
														status.activatedAt,
													).toLocaleDateString(),
												},
											)}
										</>
									)}
								</p>
							</div>
						</div>
						<span
							className="rounded-full px-2.5 py-1 text-[11px] font-medium"
							style={{ background: ACCENT_BG, color: ACCENT }}
						>
							{t("yanjing.pro.lifetimeLabel", "Lifetime · 永久")}
						</span>
					</div>

					<dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
						<div>
							<dt className="text-muted-foreground">
								{t("yanjing.account.machineName", "机器名")}
							</dt>
							<dd className="mt-1 font-mono">1 / 1</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">
								{t("yanjing.account.service", "许可校验服务")}
							</dt>
							<dd className="mt-1 font-mono">
								{status.offline
									? t(
											"yanjing.account.serviceOffline",
											"未配置（仅离线校验）",
										)
									: t("yanjing.account.serviceOnline", "已连接")}
							</dd>
						</div>
					</dl>

					<button
						type="button"
						onClick={handleManageSubscription}
						className="mt-5 inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm transition-colors hover:bg-foreground/5"
					>
						{t("yanjing.account.manageSubscription", "管理订阅")}
						<ArrowSquareOut size={13} />
					</button>
				</section>

				<section className="space-y-3">
					<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						{t("yanjing.account.subscriptionTitle", "订阅状态")}
					</h3>
					<ul className="space-y-1.5 text-xs">
						{PRO_FEATURES.map((feature, idx) => {
							return (
								<li key={idx} className="flex items-start gap-2">
									<Check size={13} style={{ color: ACCENT, marginTop: 2 }} />
									<span className="text-muted-foreground">
										{t(feature.key, feature.fallback)}
									</span>
								</li>
							);
						})}
					</ul>
				</section>
			</div>
		);
	}

	// 未激活卡
	return (
		<div className="space-y-6">
			{isMockMode && (
				<div
					className="rounded-lg border px-4 py-2.5 text-xs"
					style={{
						borderColor: "hsl(var(--border))",
						background: "hsl(var(--muted) / 0.5)",
					}}
				>
					<div className="flex items-start gap-2">
						<WarningCircle size={13} weight="bold" className="mt-0.5 shrink-0" />
						<div>
							<p className="font-medium">
								{t(
									"yanjing.pro.checkoutStatusMock",
									"Mock 模式 · 支付集成未启用",
								)}
							</p>
							<p className="mt-1 text-muted-foreground">
								{t(
									"yanjing.badgeMockModeDesc",
									"VITE_KLQ_CHECKOUT_URL 未配置,所有购买按钮指向邮件联系。配置后自动切换为 Waffo / Lemon Squeezy 在线支付。",
								)}
							</p>
						</div>
					</div>
				</div>
			)}

			<section
				className="rounded-lg border-2 px-5 py-6"
				style={{ borderColor: ACCENT }}
			>
				<div className="flex items-start justify-between gap-4">
					<div>
						<h2 className="text-xl font-semibold tracking-tight">
							{t("yanjing.account.tabPro", "Pro 会员")}
						</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							{t("yanjing.account.subtitle", "管理本机许可与 Pro 权益")}
						</p>
					</div>
					<Crown size={32} weight="duotone" style={{ color: ACCENT }} />
				</div>

				<dl className="mt-5 grid grid-cols-2 gap-3">
					<div className="rounded-md border border-border/60 px-3 py-3">
						<dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
							{t("yanjing.account.checkoutPageTitle", "Pro 年订阅")}
						</dt>
						<dd className="mt-1.5 text-xl font-semibold">
							{"$" + KLQ_PRO_PRICE_USD.toFixed(1)}
						</dd>
						<dd className="text-[11px] text-muted-foreground">USD / 年</dd>
					</div>
					<div className="rounded-md border-2 px-3 py-3" style={{ borderColor: ACCENT }}>
						<dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
							{t("yanjing.account.planLifetimeName", "Lifetime · 买断")}
						</dt>
						<dd className="mt-1.5 text-xl font-semibold">
							{"$" + KLQ_LIFETIME_PRICE_USD}
						</dd>
						<dd className="text-[11px] text-muted-foreground">
							{t("yanjing.account.featLifetimeForever", "永久免费更新")}
						</dd>
					</div>
				</dl>

				<div className="mt-5 flex flex-col gap-2">
					<button
						type="button"
						onClick={() => handleUpgrade("pro")}
						className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2.5 text-sm transition-colors hover:bg-foreground/5"
					>
						{t(
							"yanjing.account.ctaBuyPro",
							"购买 Pro · ${{price}}/年",
							{ price: KLQ_PRO_PRICE_USD.toFixed(1) },
						)}
						<ArrowRight size={13} />
					</button>
					<button
						type="button"
						onClick={() => handleUpgrade("lifetime")}
						className="inline-flex items-center justify-center gap-2 rounded-md border-2 px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
						style={{ borderColor: ACCENT, background: ACCENT, color: "#0a0a0a" }}
					>
						<Key size={14} />
						{t(
							"yanjing.account.ctaBuyLifetime",
							"购买 Lifetime · ${{price}}",
							{ price: KLQ_LIFETIME_PRICE_USD },
						)}
					</button>
					{!checkoutConfigured && (
						<p className="text-[11px] text-muted-foreground">
							{t(
								"yanjing.pro.upgradeDisabledReason",
								"支付集成未配置, 请联系销售",
							)}
						</p>
					)}
				</div>
			</section>

			<section className="space-y-3">
				<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{t("yanjing.account.planTitle", "免费版与 Pro 对照")}
				</h3>
				<dl className="space-y-2 text-xs">
					{PRO_FEATURES.map((feature, idx) => {
						return (
							<div
								key={idx}
								className="flex items-start gap-2 rounded-md border border-border/40 px-3 py-2"
							>
								<feature.icon size={13} style={{ color: ACCENT, marginTop: 2 }} />
								<span className="text-muted-foreground">
									{t(feature.key, feature.fallback)}
								</span>
							</div>
						);
					})}
				</dl>
			</section>
		</div>
	);
}

export default ProTab;
