import { ArrowRight, ArrowSquareOut, Check, Lock, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { useLicenseStatus } from "@/hooks/useLicenseStatus";
import { activateLicense, deactivateLicense, maskLicenseKey, PRO_FEATURES } from "@/lib/license";
import {
	isCheckoutConfigured,
	isLicenseServiceConfigured,
	KLQ_PRO_CHECKOUT_URL,
	KLQ_PRO_PRICE_USD,
	KLQ_REPO_URL,
} from "@/lib/licenseConfig";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type AccountCenterPanelProps = {
	open: boolean;
	/** 命中闸门的功能展示名（用于顶部提示），null 表示用户主动打开 */
	blockedFeatureLabel?: string | null;
	onClose: () => void;
};

const ACCENT = "#22c55e";

/** 权益分组的中文兜底（i18n key 见 common.json → yanjing.license.feature.*） */
export const FEATURE_LABEL_FALLBACKS: Record<string, string> = {
	transcribe: "AI 转录（语音转文字）",
	captions: "双语字幕与多语言翻译",
	generate: "摘要 / 章节 / 标题 / 标签 / 社媒文案",
	search: "语义搜索（长录屏秒级定位）",
	proofread: "字幕 AI 校对",
	edit: "一键智能剪辑与文案润色",
};

/** 取权益分组展示名（供闸门提示复用） */
export function featureLabel(
	t: (key: string, fallback?: string) => string,
	feature: string | null | undefined,
): string | null {
	if (!feature) return null;
	return t(
		`common.yanjing.license.feature.${feature}`,
		FEATURE_LABEL_FALLBACKS[feature] ?? feature,
	);
}

/**
 * 个人中心（右侧滑出）
 *
 * 三块：本机许可状态 / License 激活与停用 / Pro 权益与购买入口。
 * 设计约束：白底（浅色主题）、宽松留白、专业图标（无 emoji）、主按钮右对齐。
 */
export function AccountCenterPanel({
	open,
	blockedFeatureLabel,
	onClose,
}: AccountCenterPanelProps) {
	const { t } = useI18n();
	const status = useLicenseStatus();
	const [licenseKey, setLicenseKey] = useState("");
	const [busy, setBusy] = useState<"activating" | "deactivating" | null>(null);

	useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open, onClose]);

	const handleActivate = useCallback(async () => {
		const key = licenseKey.trim();
		if (!key) {
			toast.error(t("common.yanjing.license.emptyKey", "请输入 License key"));
			return;
		}
		setBusy("activating");
		try {
			const result = await activateLicense(key);
			if (!result.success) {
				toast.error(
					result.error ?? t("common.yanjing.license.invalidKey", "无效的许可证密钥"),
				);
				return;
			}
			setLicenseKey("");
			if (result.notice) {
				toast.warning(result.notice);
			} else {
				toast.success(t("common.yanjing.license.activatedSuccess", "激活成功!"));
			}
		} finally {
			setBusy(null);
		}
	}, [licenseKey, t]);

	const handleDeactivate = useCallback(() => {
		setBusy("deactivating");
		try {
			deactivateLicense();
			toast.success(t("common.yanjing.license.deactivated", "License 已停用"));
		} finally {
			setBusy(null);
		}
	}, [t]);

	const isProActive = status.activated && status.tier === "pro";
	const checkoutReady = isCheckoutConfigured();
	const benefits = PRO_FEATURES.map((feature) =>
		t(`common.yanjing.license.feature.${feature}`, FEATURE_LABEL_FALLBACKS[feature]),
	);

	return (
		<AnimatePresence>
			{open && (
				<>
					<motion.div
						key="account-center-backdrop"
						className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[1px]"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.16 }}
						onClick={onClose}
					/>
					<motion.aside
						key="account-center-panel"
						className={cn(
							"fixed right-0 top-0 z-50 flex h-full w-[380px] max-w-[92vw] flex-col",
							"border-l border-border bg-editor-dialog text-foreground shadow-2xl",
						)}
						initial={{ x: 380 }}
						animate={{ x: 0 }}
						exit={{ x: 380 }}
						transition={{ type: "spring", stiffness: 320, damping: 34 }}
						aria-label={t("common.yanjing.account.title", "个人中心")}
					>
						{/* 头部 */}
						<header className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
							<div>
								<h2 className="text-base font-semibold tracking-tight">
									{t("common.yanjing.account.title", "个人中心")}
								</h2>
								<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
									{t(
										"common.yanjing.account.subtitle",
										"管理本机许可与 Pro 权益",
									)}
								</p>
							</div>
							<button
								type="button"
								onClick={onClose}
								aria-label={t("common.yanjing.account.close", "关闭")}
								className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
							>
								<X size={16} weight="bold" />
							</button>
						</header>

						<div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
							{/* 闸门提示 */}
							{blockedFeatureLabel && !isProActive && (
								<div
									className="rounded-lg border px-4 py-3"
									style={{
										borderColor: `${ACCENT}55`,
										background: `${ACCENT}0d`,
									}}
								>
									<p className="text-sm font-medium">
										{t(
											"common.yanjing.license.needProTitle",
											"该功能需要 Pro 版",
										)}
									</p>
									<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
										{t(
											"common.yanjing.license.needProBody",
											"「{{feature}}」属于 Pro 权益，激活后即可使用。",
											{ feature: blockedFeatureLabel },
										)}
									</p>
								</div>
							)}

							{/* 本机许可状态 */}
							<section className="space-y-3">
								<div className="flex items-center justify-between">
									<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
										{t("common.yanjing.account.deviceLicense", "本机许可")}
									</span>
									{isProActive && (
										<span
											className="rounded-full px-2 py-0.5 text-[11px] font-medium"
											style={{ background: `${ACCENT}1f`, color: ACCENT }}
										>
											{t(
												"common.yanjing.license.lifetime",
												"买断 · 永久使用",
											)}
										</span>
									)}
								</div>
								<div
									className="rounded-lg border px-4 py-4"
									style={
										isProActive
											? {
													borderColor: `${ACCENT}55`,
													background: `${ACCENT}0d`,
												}
											: undefined
									}
								>
									<div className="flex items-center gap-2.5">
										<span
											className="h-2 w-2 rounded-full"
											style={{
												background: isProActive
													? ACCENT
													: "hsl(var(--muted-foreground))",
											}}
										/>
										<span className="text-sm font-semibold">
											{isProActive
												? t("common.yanjing.license.pro", "Pro 版")
												: t("common.yanjing.license.free", "免费版")}
										</span>
										<span className="text-xs text-muted-foreground">
											{isProActive
												? t("common.yanjing.license.activated", "已激活")
												: t(
														"common.yanjing.license.notActivated",
														"未激活",
													)}
										</span>
									</div>

									<dl className="mt-3 space-y-1.5 text-xs text-muted-foreground">
										{isProActive && status.licenseKey && (
											<div className="flex justify-between gap-4">
												<dt>
													{t(
														"common.yanjing.account.currentKey",
														"当前许可证",
													)}
												</dt>
												<dd className="font-mono">
													{maskLicenseKey(status.licenseKey)}
												</dd>
											</div>
										)}
										{isProActive && status.activatedAt && (
											<div className="flex justify-between gap-4">
												<dt>
													{t(
														"common.yanjing.account.activatedAt",
														"激活时间",
													)}
												</dt>
												<dd>
													{new Date(
														status.activatedAt,
													).toLocaleDateString()}
												</dd>
											</div>
										)}
										{isProActive && status.expiresAt && (
											<div className="flex justify-between gap-4">
												<dt>
													{t(
														"common.yanjing.license.expiresAt",
														"到期时间:{{date}}",
														{
															date: new Date(
																status.expiresAt,
															).toLocaleDateString(),
														},
													)}
												</dt>
												<dd />
											</div>
										)}
										<div className="flex justify-between gap-4">
											<dt>
												{t(
													"common.yanjing.account.service",
													"许可校验服务",
												)}
											</dt>
											<dd>
												{isLicenseServiceConfigured()
													? t(
															"common.yanjing.account.serviceOnline",
															"已连接",
														)
													: t(
															"common.yanjing.account.serviceOffline",
															"未配置(仅离线校验)",
														)}
											</dd>
										</div>
									</dl>

									{isProActive && status.offline && (
										<p className="mt-3 text-xs text-muted-foreground">
											{t(
												"common.yanjing.account.offlineNote",
												"当前离线激活：联网后可重新激活以与服务器确认。",
											)}
										</p>
									)}
								</div>
							</section>

							{/* 激活 / 停用 */}
							<section className="space-y-3">
								{!isProActive ? (
									<>
										<label
											htmlFor="kliq-license-key"
											className="block text-xs font-medium uppercase tracking-wide text-muted-foreground"
										>
											{t(
												"common.yanjing.license.enterLicenseKey",
												"输入许可证密钥",
											)}
										</label>
										<input
											id="kliq-license-key"
											type="text"
											value={licenseKey}
											onChange={(event) => setLicenseKey(event.target.value)}
											onKeyDown={(event) => {
												if (event.key === "Enter") void handleActivate();
											}}
											placeholder="kliq-pro-xxxxxxxx"
											spellCheck={false}
											className={cn(
												"w-full rounded-md border border-input bg-background px-3 py-2",
												"font-mono text-xs outline-none transition-colors",
												"focus:border-foreground/30",
											)}
										/>
										<div className="flex justify-end">
											<button
												type="button"
												onClick={() => void handleActivate()}
												disabled={busy === "activating"}
												className={cn(
													"inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-opacity",
													busy === "activating"
														? "opacity-60"
														: "hover:opacity-90",
												)}
												style={{ background: ACCENT }}
											>
												{busy === "activating"
													? t(
															"common.yanjing.license.activating",
															"校验中…",
														)
													: t("common.yanjing.license.activate", "激活")}
											</button>
										</div>
									</>
								) : (
									<div className="flex justify-end">
										<button
											type="button"
											onClick={handleDeactivate}
											disabled={busy === "deactivating"}
											className="rounded-md border border-border px-4 py-2 text-sm transition-colors hover:bg-foreground/5 disabled:opacity-60"
										>
											{busy === "deactivating"
												? t(
														"common.yanjing.license.deactivating",
														"停用中…",
													)
												: t("common.yanjing.license.deactivate", "停用")}
										</button>
									</div>
								)}
							</section>

							{/* Pro 权益 */}
							<section className="space-y-3">
								<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
									{t("common.yanjing.account.benefits", "Pro 权益")}
								</span>
								<ul className="space-y-2">
									{benefits.map((benefit) => (
										<li
											key={benefit}
											className="flex items-start gap-2 text-xs leading-relaxed"
										>
											{isProActive ? (
												<Check
													size={14}
													weight="bold"
													className="mt-0.5 shrink-0"
													style={{ color: ACCENT }}
												/>
											) : (
												<Lock
													size={13}
													className="mt-0.5 shrink-0 text-muted-foreground"
												/>
											)}
											<span
												className={
													isProActive
														? "text-foreground"
														: "text-muted-foreground"
												}
											>
												{benefit}
											</span>
										</li>
									))}
								</ul>
								<p className="text-xs leading-relaxed text-muted-foreground">
									{t(
										"common.yanjing.account.freeHint",
										"免费版已包含完整录制与基础剪辑，Pro 在此基础上解锁全部 AI 能力。",
									)}
								</p>
							</section>

							{/* 购买入口 */}
							{!isProActive && (
								<section className="space-y-2 border-t border-border pt-5">
									{checkoutReady ? (
										<a
											href={KLQ_PRO_CHECKOUT_URL}
											target="_blank"
											rel="noopener noreferrer"
											onClick={(event) => {
												event.preventDefault();
												void window.electronAPI?.openExternalUrl?.(
													KLQ_PRO_CHECKOUT_URL,
												);
											}}
											className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3 transition-colors hover:bg-foreground/[0.03]"
											style={{ borderColor: `${ACCENT}55` }}
										>
											<span>
												<span className="block text-sm font-semibold">
													{t(
														"common.yanjing.license.buyPro",
														"购买 Pro 版",
													)}
												</span>
												<span className="mt-0.5 block text-xs text-muted-foreground">
													{t(
														"common.yanjing.account.buyNote",
														"${{price}} 一次性买断 · 永久使用 · 30 天退款",
														{
															price: KLQ_PRO_PRICE_USD.toFixed(1),
														},
													)}
												</span>
											</span>
											<ArrowRight
												size={16}
												weight="bold"
												style={{ color: ACCENT }}
											/>
										</a>
									) : (
										<div className="rounded-lg border border-dashed border-border px-4 py-3">
											<p className="text-sm font-medium">
												{t(
													"common.yanjing.account.checkoutTitle",
													"购买入口未配置",
												)}
											</p>
											<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
												{t(
													"common.yanjing.account.checkoutNotConfigured",
													"构建时注入 VITE_KLQ_CHECKOUT_URL（你自己的 Lemon Squeezy 结算页）后启用。",
												)}
											</p>
										</div>
									)}
								</section>
							)}
						</div>

						{/* 底部：源码 / 许可说明 */}
						<footer className="border-t border-border px-6 py-4">
							<a
								href={KLQ_REPO_URL}
								target="_blank"
								rel="noopener noreferrer"
								onClick={(event) => {
									event.preventDefault();
									void window.electronAPI?.openExternalUrl?.(KLQ_REPO_URL);
								}}
								className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
							>
								<ArrowSquareOut size={13} />
								{t("common.yanjing.account.sourceCode", "源码")}
							</a>
							<p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/80">
								{t(
									"common.yanjing.account.licenseNote",
									"AGPL 3.0 · 基于 Recordly 修改 · 独立维护",
								)}
							</p>
						</footer>
					</motion.aside>
				</>
			)}
		</AnimatePresence>
	);
}

export default AccountCenterPanel;
