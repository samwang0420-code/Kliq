/**
 * Kliq — Pro Tab (§59-8 重设计: 2 档套餐 + Lifetime only)
 *
 * 用户拍板决策:
 *   - 默认 Free
 *   - 升级只接 Lifetime ($99 一次性买断)
 *   - 删 Pro $12.9/年 + Team $39 档
 *   - 删闸门 useEffect (改成 AccountTab 内部 useAuth 推断)
 *   - 删 License 操作按钮 (复制 / 备份 / 校验 / 停用 — 全部走 §59-7 注册/登录后 D1 后台)
 *
 * Checkout 流程(沿 §55 §GSPR-2):
 *   Worker /api/waffo/checkout (mock mode → fake URL) | LS 真 URL | mailto fallback
 *
 * §213 inline 极简风: 黑/白/灰阶, 8px 圆角, 唯一 accent #22c55e。
 */

import {
	type CSSProperties,
	type ReactNode,
	useCallback,
	useState,
} from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import {
	KLQ_LIFETIME_PRICE_USD,
	KLQ_STORE_ORDERS_URL,
	KLQ_WAFFO_BRIDGE_SECRET,
	KLQ_WAFFO_WORKER_URL,
} from "@/lib/licenseConfig";
import { toast } from "@/lib/toast";

/* ---------- §213 design tokens ---------- */

const FG = "#0a0a0a";
const BG = "#ffffff";
const BORDER = "#e4e4e7";
const MUTED = "#71717a";
const DEEP_MUTED = "#a1a1aa";
const SUBTLE_BG = "#fafafa";
const ACCENT = "#22c55e";

/* ---------- types ---------- */

type TierId = "free" | "lifetime";

type Tier = {
	id: TierId;
	nameKey: string;
	nameFallback: string;
	priceLabel: string;
	priceSubLabelKey: string;
	priceSubFallback: string;
	features: ReadonlyArray<{ key: string; fallback: string }>;
	cta: { kind: "buy" | "current"; labelKey: string; labelFallback: string } | null;
	highlight?: boolean;
};

/* ---------- 2 档 (Free + Lifetime only) ---------- */

const TIERS: ReadonlyArray<Tier> = [
	{
		id: "free",
		nameKey: "yanjing.account.tierFree",
		nameFallback: "Free",
		priceLabel: "$0",
		priceSubLabelKey: "yanjing.account.tierFreeSub",
		priceSubFallback: "永久 · 当前版本",
		features: [
			{ key: "yanjing.account.featRecord", fallback: "录屏 / 剪辑 / 导出" },
			{ key: "yanjing.account.featLocalOnly", fallback: "本地所有功能" },
			{ key: "yanjing.account.featNoAi", fallback: "不含 AI 转录 / 字幕" },
		],
		cta: {
			kind: "current",
			labelKey: "yanjing.account.ctaCurrentPlan",
			labelFallback: "当前方案",
		},
	},
	{
		id: "lifetime",
		nameKey: "yanjing.account.tierLifetime",
		nameFallback: "Lifetime",
		priceLabel: `$${KLQ_LIFETIME_PRICE_USD}`,
		priceSubLabelKey: "yanjing.account.tierLifetimeSub",
		priceSubFallback: "一次性买断 · 永久",
		features: [
			{ key: "yanjing.account.featAllAi", fallback: "所有 AI 转录 / 字幕 / 摘要" },
			{ key: "yanjing.account.featMultiLang", fallback: "双语字幕 / 多语言翻译" },
			{ key: "yanjing.account.featSemantic", fallback: "语义搜索长录屏" },
			{ key: "yanjing.account.featLifetimeUpdate", fallback: "永久免费更新所有新功能" },
			{ key: "yanjing.account.featBestValue", fallback: "性价比最高 · 一次付费终身使用" },
		],
		cta: {
			kind: "buy",
			labelKey: "yanjing.account.ctaBuyLifetime",
			labelFallback: "购买 Lifetime · 永久",
		},
		highlight: true,
	},
];

/* ---------- checkout (Waffo Worker → LS fallback → mailto) ---------- */

async function openCheckout(): Promise<void> {
	const workerUrl = KLQ_WAFFO_WORKER_URL;
	const secret = KLQ_WAFFO_BRIDGE_SECRET;

	if (!workerUrl) {
		// Fallback: 邮件联系 (沿 §250 — 收款只接 USDT / Waffo, 邮件托底是临时措施)
		window.location.href = "mailto:hi@yanjingai.tech?subject=Kliq%20Lifetime%20inquiry";
		return;
	}

	try {
		const res = await fetch(`${workerUrl}/api/waffo/checkout`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-KLQ-Bridge-Secret": secret,
			},
			body: JSON.stringify({ plan: "lifetime" }),
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = (await res.json()) as { checkoutUrl?: string };
		if (!data.checkoutUrl) throw new Error("missing checkoutUrl");
		window.open(data.checkoutUrl, "_blank", "noopener,noreferrer");
	} catch (err) {
		toast.error(
			`打开结算页失败: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

/* ---------- card styles (highlight = 黑边 + 绿点 badge) ---------- */

function getTierCardStyle(tier: Tier): CSSProperties {
	if (!tier.highlight) {
		return {
			border: `1px solid ${BORDER}`,
			borderRadius: 12,
			padding: "20px 16px",
			backgroundColor: BG,
			display: "flex",
			flexDirection: "column",
			gap: 12,
		};
	}
	return {
		border: `2px solid ${ACCENT}`,
		borderRadius: 12,
		padding: "20px 16px",
		backgroundColor: BG,
		display: "flex",
		flexDirection: "column",
		gap: 12,
		position: "relative",
	};
}

/* ---------- main component ---------- */

export function ProTab(): ReactNode {
	const t = useScopedT("common");
	const { state } = useAuth();
	const [busy, setBusy] = useState(false);

	const isLifetime =
		state.status === "authenticated" && state.user.tier === "lifetime";

	const handleBuy = useCallback(async () => {
		if (isLifetime) return;
		setBusy(true);
		try {
			await openCheckout();
		} finally {
			setBusy(false);
		}
	}, [isLifetime]);

	if (state.status === "loading") {
		return (
			<div
				style={{
					padding: 32,
					textAlign: "center",
					color: MUTED,
					fontSize: 13,
				}}
			>
				{t("yanjing.account.loadingAccount", "正在读取账户信息…")}
			</div>
		);
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
			<section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
				<h2
					style={{
						margin: 0,
						fontSize: 20,
						fontWeight: 600,
						color: FG,
						letterSpacing: "-0.01em",
					}}
				>
					{t("yanjing.account.upgradeTitle", "升级 Lifetime")}
				</h2>
				<p
					style={{
						margin: 0,
						fontSize: 13,
						color: MUTED,
						lineHeight: 1.55,
					}}
				>
					{t(
						"yanjing.account.upgradeSubtitle",
						"一次性买断,永久免费升级所有新功能。",
					)}
				</p>
			</section>

			{!KLQ_WAFFO_WORKER_URL ? (
				<div
					role="status"
					style={{
						padding: "8px 12px",
						fontSize: 12,
						color: MUTED,
						backgroundColor: SUBTLE_BG,
						border: `1px solid ${BORDER}`,
						borderRadius: 8,
					}}
				>
					<span
						aria-hidden
						style={{
							display: "inline-block",
							width: 6,
							height: 6,
							borderRadius: 999,
							backgroundColor: ACCENT,
							marginRight: 8,
						}}
					/>
					{t(
						"yanjing.account.workerMock",
						"Worker 未配置 · 走邮件联系兜底 (live 模式需 VITE_KLQ_WAFFO_WORKER_URL)",
					)}
				</div>
			) : null}

			<section
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
					gap: 12,
				}}
			>
				{TIERS.map((tier) => {
					const isCurrent = tier.id === "free" && !isLifetime;
					const showBuy = tier.id === "lifetime" && !isLifetime;
					const isPaidActive = tier.id === "lifetime" && isLifetime;

					return (
						<div key={tier.id} style={getTierCardStyle(tier)}>
							{tier.highlight ? (
								<span
									data-testid="best-value-badge"
									aria-hidden
									style={{
										position: "absolute",
										top: -10,
										right: 16,
										display: "inline-flex",
										alignItems: "center",
										gap: 6,
										padding: "2px 10px",
										fontSize: 10,
										fontWeight: 600,
										color: FG,
										backgroundColor: BG,
										border: `1px solid ${ACCENT}`,
										borderRadius: 999,
										letterSpacing: "0.05em",
										textTransform: "uppercase",
									}}
								>
									<span
										style={{
											display: "inline-block",
											width: 6,
											height: 6,
											borderRadius: 999,
											backgroundColor: ACCENT,
										}}
									/>
									{t("yanjing.account.bestValue", "最佳价值")}
								</span>
							) : null}

							<div
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
								}}
							>
								<h3
									style={{
										margin: 0,
										fontSize: 15,
										fontWeight: 600,
										color: FG,
										letterSpacing: "-0.01em",
									}}
								>
									{t(tier.nameKey, tier.nameFallback)}
								</h3>
								{isPaidActive ? (
									<span
										style={{
											display: "inline-flex",
											alignItems: "center",
											gap: 4,
											padding: "2px 8px",
											fontSize: 10,
											fontWeight: 600,
											color: FG,
											backgroundColor: BG,
											border: `1px solid ${ACCENT}`,
											borderRadius: 999,
											letterSpacing: "0.04em",
											textTransform: "uppercase",
										}}
									>
										<span
											style={{
												display: "inline-block",
												width: 5,
												height: 5,
												borderRadius: 999,
												backgroundColor: ACCENT,
											}}
										/>
										ACTIVE
									</span>
								) : null}
							</div>

							<div>
								<div
									style={{
										fontSize: 28,
										fontWeight: 700,
										letterSpacing: "-0.03em",
										color: FG,
										lineHeight: 1,
									}}
								>
									{tier.priceLabel}
								</div>
								<div
									style={{
										fontSize: 12,
										color: MUTED,
										marginTop: 4,
									}}
								>
									{t(tier.priceSubLabelKey, tier.priceSubFallback)}
								</div>
							</div>

							<ul
								style={{
									margin: 0,
									padding: 0,
									listStyle: "none",
									display: "flex",
									flexDirection: "column",
									gap: 6,
									flex: 1,
								}}
							>
								{tier.features.map((feat) => (
									<li
										key={feat.key}
										style={{
											display: "flex",
											alignItems: "flex-start",
											gap: 6,
											fontSize: 12,
											color: FG,
											lineHeight: 1.45,
										}}
									>
										<span
											aria-hidden
											style={{
												color: ACCENT,
												flexShrink: 0,
												marginTop: 2,
											}}
										>
											✓
										</span>
										<span>{t(feat.key, feat.fallback)}</span>
									</li>
								))}
							</ul>

							<div style={{ marginTop: "auto" }}>
								{showBuy ? (
									<button
										type="button"
										onClick={() => void handleBuy()}
										disabled={busy}
										data-testid="buy-lifetime-cta"
										style={{
											display: "inline-flex",
											alignItems: "center",
											justifyContent: "center",
											gap: 6,
											width: "100%",
											padding: "10px 14px",
											fontSize: 13,
											fontWeight: 600,
											color: BG,
											backgroundColor: busy ? DEEP_MUTED : FG,
											border: "none",
											borderRadius: 8,
											cursor: busy ? "not-allowed" : "pointer",
											transition:
												"background-color 160ms cubic-bezier(0.16, 1, 0.3, 1)",
										}}
									>
										{busy
											? t("yanjing.account.openingCheckout", "正在打开…")
											: t(tier.cta!.labelKey, tier.cta!.labelFallback)}
									</button>
								) : isCurrent ? (
									<button
										type="button"
										disabled
										data-testid="current-plan-button"
										style={{
											display: "inline-flex",
											alignItems: "center",
											justifyContent: "center",
											width: "100%",
											padding: "10px 14px",
											fontSize: 13,
											fontWeight: 500,
											color: MUTED,
											backgroundColor: SUBTLE_BG,
											border: `1px solid ${BORDER}`,
											borderRadius: 8,
											cursor: "not-allowed",
										}}
									>
										{t(tier.cta!.labelKey, tier.cta!.labelFallback)}
									</button>
								) : isPaidActive ? (
									<a
										href={KLQ_STORE_ORDERS_URL}
										target="_blank"
										rel="noreferrer"
										style={{
											display: "inline-flex",
											alignItems: "center",
											justifyContent: "center",
											width: "100%",
											padding: "10px 14px",
											fontSize: 13,
											fontWeight: 500,
											color: FG,
											backgroundColor: BG,
											border: `1px solid ${BORDER}`,
											borderRadius: 8,
											textDecoration: "none",
											transition:
												"all 160ms cubic-bezier(0.16, 1, 0.3, 1)",
										}}
									>
										{t("yanjing.account.manageSubscription", "管理订阅")}
									</a>
								) : null}
							</div>
						</div>
					);
				})}
			</section>

			<p
				style={{
					fontSize: 11,
					color: DEEP_MUTED,
					lineHeight: 1.5,
					margin: 0,
				}}
			>
				{t(
					"yanjing.account.refundNote",
					"7 天无理由退款 — 发邮件即可处理。",
				)}
			</p>
		</div>
	);
}

export default ProTab;
