/**
 * Kliq — 个人中心 (§58-1 重设计: 居中大对话框 + §213 inline 极简风)
 *
 * 旧版痛点 (§57 §1.1 + §58 用户反馈):
 *  - fixed bottom-3 left-14 420px 小弹窗, 太挤 + 难发现
 *  - 视觉跟豆包 / WorkBuddy 的云端账号中心完全没法比
 *
 * 新版设计 (§58):
 *  - 居中大对话框 (720px max-width, 88vh max-height)
 *  - §213 inline-style 极简风: 黑/白/灰阶/绿点/8px 圆角/120-160ms ease
 *  - backdrop 半透明黑 + Esc / backdrop click 关闭
 *  - 4 Tab 内部内容暂保留 §57-1 Tailwind 版本 (沿用, 不动)
 *  - 闸门命中时自动切到 Pro 会员 Tab (openAccountCenter(feature))
 */

import { type CSSProperties, type ReactNode, memo, useCallback, useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { useLicenseStatus } from "@/hooks/useLicenseStatus";
import { AccountTab } from "./tabs/AccountTab";
import { AiTab } from "./tabs/AiTab";
import { featureLabel as _featureLabel } from "./tabs/AccountTab";
export const featureLabel = _featureLabel;
import { HelpTab } from "./tabs/HelpTab";
import { ProTab } from "./tabs/ProTab";

type TabId = "account" | "pro" | "ai" | "help";

type TabDef = {
	id: TabId;
	labelKey: string;
	fallback: string;
};

const TABS: ReadonlyArray<TabDef> = [
	{ id: "account", labelKey: "yanjing.account.tabAccount", fallback: "账户" },
	{ id: "pro", labelKey: "yanjing.account.tabPro", fallback: "Pro 会员" },
	{ id: "ai", labelKey: "yanjing.account.tabAi", fallback: "AI 服务" },
	{ id: "help", labelKey: "yanjing.account.tabHelp", fallback: "帮助" },
];

type AccountCenterPanelProps = {
	open: boolean;
	/** 命中闸门的功能展示名（用于顶部提示），null 表示用户主动打开 */
	blockedFeatureLabel?: string | null;
	onClose: () => void;
};

// §213 design tokens
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

const OVERLAY_STYLE: CSSProperties = {
	position: "fixed",
	inset: 0,
	background: "rgba(10, 10, 10, 0.45)",
	zIndex: 50,
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	padding: "20px",
};

const DIALOG_STYLE: CSSProperties = {
	background: COLORS.bgPrimary,
	borderRadius: `${RADIUS * 1.5}px`,
	border: `1px solid ${COLORS.border}`,
	boxShadow: "0 20px 60px rgba(10, 10, 10, 0.12), 0 4px 16px rgba(10, 10, 10, 0.04)",
	width: "100%",
	maxWidth: "720px",
	maxHeight: "88vh",
	display: "flex",
	flexDirection: "column",
	overflow: "hidden",
	fontFamily:
		'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
};

const HEADER_STYLE: CSSProperties = {
	display: "flex",
	alignItems: "flex-start",
	justifyContent: "space-between",
	padding: "24px 28px 16px 28px",
	borderBottom: `1px solid ${COLORS.border}`,
	flexShrink: 0,
};

const TITLE_STYLE: CSSProperties = {
	margin: 0,
	fontSize: "20px",
	fontWeight: 600,
	letterSpacing: "-0.02em",
	color: COLORS.textPrimary,
	lineHeight: 1.2,
};

const SUBTITLE_STYLE: CSSProperties = {
	margin: "6px 0 0 0",
	fontSize: "13px",
	color: COLORS.textSecondary,
	lineHeight: 1.5,
};

const CLOSE_BTN_STYLE: CSSProperties = {
	background: "transparent",
	border: `1px solid ${COLORS.border}`,
	borderRadius: `${RADIUS}px`,
	width: "32px",
	height: "32px",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	cursor: "pointer",
	color: COLORS.textSecondary,
	fontSize: "16px",
	fontFamily: "inherit",
	transition: "all 140ms " + EASE,
	padding: 0,
};

const GATE_BANNER_STYLE: CSSProperties = {
	margin: "16px 28px 0 28px",
	padding: "12px 16px",
	borderRadius: `${RADIUS}px`,
	border: `1px solid ${COLORS.accentBorder}`,
	background: COLORS.accentBgLight,
	fontSize: "13px",
	lineHeight: 1.5,
};

const TAB_BAR_STYLE: CSSProperties = {
	display: "flex",
	padding: "0 28px",
	borderBottom: `1px solid ${COLORS.border}`,
	flexShrink: 0,
	gap: "4px",
};

function getTabBtnStyle(active: boolean): CSSProperties {
	return {
		background: "transparent",
		border: "none",
		borderBottom: `2px solid ${active ? COLORS.accent : "transparent"}`,
		padding: "14px 16px",
		fontSize: "13px",
		fontWeight: active ? 600 : 500,
		color: active ? COLORS.textPrimary : COLORS.textSecondary,
		cursor: "pointer",
		transition: "all 140ms " + EASE,
		fontFamily: "inherit",
		display: "flex",
		alignItems: "center",
		gap: "6px",
		marginBottom: "-1px", // 让 active border-bottom 跟容器 border-bottom 重合
	};
}

const PRO_BADGE_STYLE: CSSProperties = {
	background: COLORS.accentBg,
	color: COLORS.accent,
	borderRadius: "999px",
	padding: "2px 7px",
	fontSize: "9px",
	fontWeight: 700,
	letterSpacing: "0.04em",
};

const TAB_BODY_STYLE: CSSProperties = {
	flex: 1,
	overflowY: "auto",
	padding: "24px 28px 28px 28px",
};

const PRO_BADGE_DISPLAY_STYLE: CSSProperties = {
	display: "inline-flex",
	alignItems: "center",
	gap: "4px",
	background: COLORS.accentBg,
	color: COLORS.accent,
	borderRadius: "999px",
	padding: "2px 8px",
	fontSize: "10px",
	fontWeight: 700,
	letterSpacing: "0.04em",
	marginLeft: "8px",
};

function AccountCenterPanelImpl({
	open,
	blockedFeatureLabel,
	onClose,
}: AccountCenterPanelProps): ReactNode {
	const t = useScopedT("common");
	const status = useLicenseStatus();
	const isProActive = status.activated && status.tier === "pro";

	// 默认 Tab: Pro 会员 (未激活) / 账户 (已激活)
	const [tab, setTab] = useState<TabId>(isProActive ? "account" : "pro");

	// 闸门命中时自动切到 Pro 会员 Tab (§57 §2.1)
	useEffect(() => {
		if (blockedFeatureLabel && !isProActive) {
			setTab("pro");
		}
	}, [blockedFeatureLabel, isProActive]);

	// Esc / backdrop click 关闭 (§58-1 居中大对话框, backdrop 是 panel 外面)
	useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [open, onClose]);

	const renderTab = useCallback((): ReactNode => {
		switch (tab) {
			case "account":
				return <AccountTab />;
			case "pro":
				return <ProTab />;
			case "ai":
				return <AiTab />;
			case "help":
				return <HelpTab />;
			default:
				return <AccountTab />;
		}
	}, [tab]);

	if (!open) return null;

	return (
		<div
			style={OVERLAY_STYLE}
			data-account-center-overlay
			onMouseDown={(event) => {
				// 点 backdrop 关闭 (§58-1 大对话框交互)
				if (event.target === event.currentTarget) {
					onClose();
				}
			}}
		>
			<div
				data-account-center-panel
				role="dialog"
				aria-modal="true"
				aria-label={t("yanjing.account.title", "个人中心")}
				style={DIALOG_STYLE}
			>
				{/* Header */}
				<header style={HEADER_STYLE}>
					<div>
						<h2 style={TITLE_STYLE}>
							{t("yanjing.account.title", "个人中心")}
							{isProActive && (
								<span style={PRO_BADGE_DISPLAY_STYLE}>
									<span
										style={{
											width: "6px",
											height: "6px",
											borderRadius: "999px",
											background: COLORS.accent,
										}}
									/>
									{t("yanjing.pro.lifetimeLabel", "Lifetime · 永久")}
								</span>
							)}
						</h2>
						<p style={SUBTITLE_STYLE}>
							{t("yanjing.account.subtitle", "管理本机许可与 Pro 权益")}
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						aria-label={t("yanjing.account.close", "关闭")}
						style={CLOSE_BTN_STYLE}
						onMouseEnter={(event) => {
							event.currentTarget.style.background = COLORS.bgTertiary;
							event.currentTarget.style.color = COLORS.textPrimary;
						}}
						onMouseLeave={(event) => {
							event.currentTarget.style.background = "transparent";
							event.currentTarget.style.color = COLORS.textSecondary;
						}}
					>
						×
					</button>
				</header>

				{/* 闸门提示 (仅未激活时) */}
				{blockedFeatureLabel && !isProActive && (
					<div style={GATE_BANNER_STYLE}>
						<p
							style={{
								margin: 0,
								fontWeight: 600,
								color: COLORS.textPrimary,
							}}
						>
							{t("yanjing.license.needProTitle", "该功能需要 Pro 版")}
						</p>
						<p
							style={{
								margin: "4px 0 0 0",
								color: COLORS.textSecondary,
							}}
						>
							{t(
								"yanjing.license.needProBody",
								"「{{feature}}」属于 Pro 权益，激活后即可使用。",
								{ feature: blockedFeatureLabel },
							)}
						</p>
					</div>
				)}

				{/* Tab Bar */}
				<nav
					role="tablist"
					aria-label={t("yanjing.account.title", "个人中心")}
					style={TAB_BAR_STYLE}
				>
					{TABS.map((tdef) => {
						const active = tab === tdef.id;
						const showProBadge = tdef.id === "pro" && isProActive;
						return (
							<button
								key={tdef.id}
								type="button"
								role="tab"
								aria-selected={active}
								data-tab-id={tdef.id}
								onClick={() => setTab(tdef.id)}
								style={getTabBtnStyle(active)}
								onMouseEnter={(event) => {
									if (!active) {
										event.currentTarget.style.color = COLORS.textPrimary;
									}
								}}
								onMouseLeave={(event) => {
									if (!active) {
										event.currentTarget.style.color = COLORS.textSecondary;
									}
								}}
							>
								{t(tdef.labelKey, tdef.fallback)}
								{showProBadge && (
									<span style={PRO_BADGE_STYLE}>
										{t("yanjing.ai.proBadge", "PRO")}
									</span>
								)}
							</button>
						);
					})}
				</nav>

				{/* Tab Body */}
				<div role="tabpanel" data-tab-panel={tab} style={TAB_BODY_STYLE}>
					{renderTab()}
				</div>
			</div>
		</div>
	);
}

export const AccountCenterPanel = memo(AccountCenterPanelImpl);
export default AccountCenterPanel;
