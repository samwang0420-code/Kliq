/**
 * Kliq — 个人中心 (§57-1 重设计: 4 Tab 布局)
 *
 * 旧版痛点 (§57 §1.1):
 *  - 单列堆叠 dialog, 5 段塞一起
 *  - 无在线升级, 只能手动激活 license key
 *  - 激活后只显示绿点 + 文字
 *  - AI 服务 / 帮助碎片散在底部
 *
 * 新版设计 (§57 §2.1):
 *  - 4 Tab 切换: 账户 / Pro 会员 / AI 服务 / 帮助
 *  - 闸门命中时自动切到 Pro 会员 Tab (openAccountCenter(feature))
 *  - 视觉风格沿用现有 Tailwind/shadcn, 不破坏 §213 沿用要求
 *  - CheckoutPage (§54) 仍由 Pro 会员 Tab 的 [查看方案] 按钮触发
 */

import { X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import {
	memo,
	type ReactNode,
	useCallback,
	type CSSProperties,
	useEffect,
	useState,
} from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { useLicenseStatus } from "@/hooks/useLicenseStatus";
import { cn } from "@/lib/utils";
import { AccountTab } from "./tabs/AccountTab";
import { AiTab } from "./tabs/AiTab";
import { HelpTab } from "./tabs/HelpTab";
import { featureLabel as _featureLabel } from "./tabs/AccountTab";
export const featureLabel = _featureLabel;
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

const ACCENT = "#22c55e";

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

	// 关闭 / Esc / 点外部 关闭
	useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		const onMouseDown = (event: MouseEvent) => {
			const target = event.target;
			if (target instanceof Element && target.closest("[data-account-center-panel]")) {
				return;
			}
			onClose();
		};
		window.addEventListener("keydown", onKeyDown);
		document.addEventListener("mousedown", onMouseDown);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("mousedown", onMouseDown);
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

	return (
		<>
			<AnimatePresence>
				{open && (
					<motion.aside
						key="account-center-panel"
						data-account-center-panel
						role="dialog"
						aria-modal="false"
						className={cn(
							"fixed bottom-3 left-14 z-50 flex max-h-[78vh] w-[420px] max-w-[92vw] flex-col overflow-hidden",
							"rounded-xl border border-border bg-editor-dialog text-foreground shadow-2xl",
						)}
						initial={{ y: 12, opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						exit={{ y: 12, opacity: 0 }}
						transition={{ duration: 0.14, ease: "easeOut" }}
						aria-label={t("yanjing.account.title", "个人中心")}
					>
						{/* Header */}
						<header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
							<div>
								<h2 className="text-base font-semibold tracking-tight">
									{t("yanjing.account.title", "个人中心")}
								</h2>
								<p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
									{t("yanjing.account.subtitle", "管理本机许可与 Pro 权益")}
								</p>
							</div>
							<button
								type="button"
								onClick={onClose}
								aria-label={t("yanjing.account.close", "关闭")}
								className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
							>
								<X size={16} weight="bold" />
							</button>
						</header>

						{/* 闸门提示 (仅未激活时) */}
						{blockedFeatureLabel && !isProActive && (
							<div
								className="mx-5 mt-3 rounded-md border px-3 py-2.5 text-xs"
								style={{
									borderColor: ACCENT + "55",
									background: ACCENT + "0d",
								}}
							>
								<p className="font-medium">
									{t("yanjing.license.needProTitle", "该功能需要 Pro 版")}
								</p>
								<p className="mt-1 text-muted-foreground">
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
							className="flex shrink-0 border-b border-border px-2"
						>
							{TABS.map((tdef) => {
								const active = tab === tdef.id;
								const showProBadge = tdef.id === "pro" && isProActive;
								const linkStyle: CSSProperties = active
									? {
											color: ACCENT,
											borderBottomColor: ACCENT,
										}
									: {
											color: "hsl(var(--muted-foreground))",
											borderBottomColor: "transparent",
									};
								return (
									<button
										key={tdef.id}
										type="button"
										role="tab"
										aria-selected={active}
										data-tab-id={tdef.id}
										onClick={() => setTab(tdef.id)}
										className={cn(
											"relative flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs transition-colors",
											"border-b-2",
											active
												? "font-medium"
												: "hover:text-foreground",
										)}
										style={linkStyle}
									>
										{t(tdef.labelKey, tdef.fallback)}
										{showProBadge && (
											<span
												className="rounded-full px-1.5 text-[9px] font-bold tracking-wide"
												style={{ background: ACCENT + "1f", color: ACCENT }}
											>
												{t("yanjing.ai.proBadge", "PRO")}
											</span>
										)}
									</button>
								);
							})}
						</nav>

						{/* Tab Body */}
						<div
							role="tabpanel"
							data-tab-panel={tab}
							className="flex-1 overflow-y-auto px-5 py-5"
						>
							{renderTab()}
						</div>
					</motion.aside>
				)}
			</AnimatePresence>
		</>
	);
}

export const AccountCenterPanel = memo(AccountCenterPanelImpl);
export default AccountCenterPanel;
