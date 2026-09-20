import {
	ArrowRight,
	ArrowSquareOut,
	Check,
	CheckCircle,
	Copy,
	DownloadSimple,
	Info,
	Lock,
	UploadSimple,
	WarningCircle,
	X,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import {
	type CSSProperties,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useI18n } from "@/contexts/I18nContext";
import { useLicenseStatus } from "@/hooks/useLicenseStatus";
import {
	activateLicense,
	deactivateLicense,
	FREE_FEATURES,
	maskLicenseKey,
	PRO_FEATURES,
} from "@/lib/license";
import {
	buildLicenseBackup,
	type LicenseBackupErrorReason,
	parseLicenseBackup,
	serializeLicenseBackup,
	suggestLicenseBackupFileName,
} from "@/lib/licenseBackup";
import {
	buildLicenseRequestMailto,
	type CommercialConfigItem,
	getCommercialConfigStatus,
	isCheckoutConfigured,
	isLicenseServiceConfigured,
	KLQ_ISSUES_URL,
	KLQ_PRO_CHECKOUT_URL,
	KLQ_PRO_PRICE_USD,
	KLQ_REFUND_POLICY_URL,
	KLQ_REPO_URL,
	KLQ_STORE_ORDERS_URL,
} from "@/lib/licenseConfig";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { AiServiceSection } from "./AiServiceSection";

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

/** 免费能力分组的中文兜底（i18n key：yanjing.license.freeFeature.*） */
export const FREE_FEATURE_LABEL_FALLBACKS: Record<string, string> = {
	recording: "完整屏幕 / 窗口录制，含麦克风与系统声音",
	editing: "手动剪辑：裁剪、变速、片段增删",
	localCleanup: "本地智能清理：去静音 / 去填充词 / 智能加速 / 自动取景",
	annotate: "光标美化、点击特效、背景与阴影",
	exporting: "无水印导出 MP4，无时长限制",
	privacy: "全程本地处理，不需要账号",
};

/** 恢复失败的原因码 → i18n 键 + 文案兜底（成对声明，避免加了原因码忘了文案） */
const BACKUP_REASON_MESSAGES: Record<LicenseBackupErrorReason, { key: string; fallback: string }> =
	{
		notJson: {
			key: "common.yanjing.account.backupReasonNotJson",
			fallback: "文件内容不是合法的 JSON",
		},
		notObject: {
			key: "common.yanjing.account.backupReasonNotObject",
			fallback: "文件结构不对",
		},
		wrongFormat: {
			key: "common.yanjing.account.backupReasonWrongFormat",
			fallback: "这不是 Kliq 的许可证备份文件",
		},
		unsupportedVersion: {
			key: "common.yanjing.account.backupReasonUnsupportedVersion",
			fallback: "备份文件版本不受支持，请升级应用后再试",
		},
		invalidKey: {
			key: "common.yanjing.account.backupReasonInvalidKey",
			fallback: "备份里的许可证密钥格式无效",
		},
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

/** 小标题 */
function SectionTitle({ children }: { children: ReactNode }) {
	return (
		<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
			{children}
		</span>
	);
}

/** 外链按钮：桌面端走系统浏览器，浏览器预览里退化为普通链接 */
function ExternalLink({
	href,
	children,
	className,
	style,
}: {
	href: string;
	children: ReactNode;
	className?: string;
	style?: CSSProperties;
}) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			onClick={(event) => {
				// 只有在确实能接管时才 preventDefault：浏览器预览 / 单测里没有
				// Electron 桥，若照旧拦掉默认行为，链接会变成「在但点不动」。
				const openExternal = window.electronAPI?.openExternalUrl;
				if (!openExternal) return;
				event.preventDefault();
				void openExternal(href);
			}}
			className={className}
			style={style}
		>
			{children}
		</a>
	);
}

/**
 * 个人中心（右侧滑出）
 *
 * 区块顺序＝用户真正会问的顺序：
 *   本机许可（我是什么状态）→ 激活/停用 → 免费版与 Pro 差在哪 →
 *   AI 服务（要用自己的 key）→ 购买与售后 → 配置自检
 *
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
	const [busy, setBusy] = useState<"activating" | "deactivating" | "revalidating" | null>(null);
	const restoreInputRef = useRef<HTMLInputElement | null>(null);

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
			// 停用后把 key 回填到输入框：用户多半只是要换机器 / 重新激活，
			// 让他重新手抄一遍 8 位 hex 没有必要。
			const previous = status.licenseKey ?? "";
			deactivateLicense();
			setLicenseKey(previous);
			toast.success(t("common.yanjing.license.deactivated", "License 已停用"));
		} finally {
			setBusy(null);
		}
	}, [t, status.licenseKey]);

	const handleCopyKey = useCallback(() => {
		const key = status.licenseKey;
		if (!key) return;
		void navigator.clipboard
			.writeText(key)
			.then(() => toast.success(t("common.yanjing.account.copied", "已复制")))
			.catch(() =>
				toast.error(t("common.yanjing.account.copyFail", "复制失败，请手动抄写许可证")),
			);
	}, [status.licenseKey, t]);

	/**
	 * 重新做一次在线校验。
	 *
	 * 此前离线激活的提示写着「联网后可重新激活以与服务器确认」，但 Pro 一旦激活，
	 * 界面上只剩「停用」—— 那条被承诺的路**根本不存在**。这里把它补上。
	 */
	const handleRevalidate = useCallback(async () => {
		const key = status.licenseKey;
		if (!key) return;
		setBusy("revalidating");
		try {
			const result = await activateLicense(key);
			if (!result.success) {
				toast.error(result.error ?? t("common.yanjing.account.revalidateFail", "校验失败"));
				return;
			}
			if (result.notice) {
				toast.warning(
					t("common.yanjing.account.revalidateOffline", "校验服务不可用，仍为离线状态"),
				);
				return;
			}
			toast.success(
				t("common.yanjing.account.revalidateOk", "已与服务器确认，Pro 状态已更新"),
			);
		} finally {
			setBusy(null);
		}
	}, [status.licenseKey, t]);

	/**
	 * 把许可证存成文件。
	 *
	 * 一次性买断的产品，Pro 权限只活在**这台机器**上；key 也只在购买时发过一封
	 * 邮件。此前没有任何办法把它保存下来，重装系统就等于失去买过的东西。
	 */
	const handleExportBackup = useCallback(() => {
		const key = status.licenseKey;
		if (!key) return;
		try {
			const backup = buildLicenseBackup({
				licenseKey: key,
				activatedAt: status.activatedAt,
				offline: status.offline,
			});
			const blob = new Blob([serializeLicenseBackup(backup)], {
				type: "application/json",
			});
			const objectUrl = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = objectUrl;
			anchor.download = suggestLicenseBackupFileName();
			anchor.rel = "noopener";
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			// 立刻 revoke 会让部分 Chromium 版本拿不到内容，放到下一轮事件循环
			window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
			toast.success(t("common.yanjing.account.backupExported", "已导出备份文件"));
		} catch {
			toast.error(t("common.yanjing.account.backupFailed", "导出失败，请改用复制密钥"));
		}
	}, [status.licenseKey, status.activatedAt, status.offline, t]);

	/**
	 * 从备份文件恢复。
	 *
	 * 刻意**不直接把文件内容写进存储**：只取出里面的 key，再走一遍
	 * `activateLicense()`。这样伪造的文件最多等于「手输一个格式合法的 key」，
	 * 不可能绕过在线校验把状态改成 Pro。
	 */
	const handleRestoreFile = useCallback(
		async (file: File) => {
			let text: string;
			try {
				text = await file.text();
			} catch {
				toast.error(
					t(
						"common.yanjing.account.backupReadFailed",
						"无法读取该文件，请确认它不是加密的",
					),
				);
				return;
			}

			const parsed = parseLicenseBackup(text);
			if (!parsed.ok) {
				const message = BACKUP_REASON_MESSAGES[parsed.reason];
				toast.error(t(message.key, message.fallback));
				return;
			}

			setBusy("activating");
			try {
				const result = await activateLicense(parsed.backup.licenseKey);
				if (!result.success) {
					toast.error(
						result.error ?? t("common.yanjing.account.backupRestoreFailed", "恢复失败"),
					);
					return;
				}
				if (result.notice) {
					toast.warning(result.notice);
				}
				toast.success(
					t("common.yanjing.account.backupRestored", "已从备份恢复，Pro 已重新激活"),
				);
			} finally {
				setBusy(null);
			}
		},
		[t],
	);

	const isProActive = status.activated && status.tier === "pro";
	const checkoutReady = isCheckoutConfigured();
	const benefits = PRO_FEATURES.map((feature) =>
		t(`common.yanjing.license.feature.${feature}`, FEATURE_LABEL_FALLBACKS[feature]),
	);
	const freeBenefits = FREE_FEATURES.map((feature) =>
		t(`common.yanjing.license.freeFeature.${feature}`, FREE_FEATURE_LABEL_FALLBACKS[feature]),
	);
	const configItems: CommercialConfigItem[] = getCommercialConfigStatus();
	const buildConfigMissing = configItems.filter(
		(item) => item.scope === "build" && item.set === false,
	);
	const serverConfigKeys = configItems
		.filter((item) => item.scope === "pages")
		.map((item) => item.key);

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

						{/* 隐藏的文件选择框必须**常驻**：它同时服务「已激活时的备份恢复」和
						    未激活时的「从文件恢复」，放进条件分支里会让其中一个按钮点了没反应。 */}
						<input
							ref={restoreInputRef}
							type="file"
							accept=".json,application/json"
							className="hidden"
							aria-hidden="true"
							tabIndex={-1}
							onChange={(event) => {
								const file = event.target.files?.[0];
								// 清空 value，否则连续选同一个文件不会再触发 change
								event.target.value = "";
								if (file) void handleRestoreFile(file);
							}}
						/>

						<div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
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

							{/* ---------- 本机许可 ---------- */}
							<section className="space-y-3">
								<div className="flex items-center justify-between">
									<SectionTitle>
										{t("common.yanjing.account.deviceLicense", "本机许可")}
									</SectionTitle>
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
											<div className="flex items-center justify-between gap-4">
												<dt>
													{t(
														"common.yanjing.account.currentKey",
														"当前许可证",
													)}
												</dt>
												<dd className="flex items-center gap-1.5">
													<span className="font-mono">
														{maskLicenseKey(status.licenseKey)}
													</span>
													<button
														type="button"
														onClick={handleCopyKey}
														title={t(
															"common.yanjing.account.copyKey",
															"复制密钥",
														)}
														aria-label={t(
															"common.yanjing.account.copyKey",
															"复制密钥",
														)}
														className="rounded p-0.5 transition-colors hover:bg-foreground/5 hover:text-foreground"
													>
														<Copy size={11} />
													</button>
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
										<div className="mt-3 flex items-start justify-between gap-3">
											<p className="text-xs leading-relaxed text-muted-foreground">
												{t(
													"common.yanjing.account.offlineNote",
													"当前离线激活：联网后可重新激活以与服务器确认。",
												)}
											</p>
											<button
												type="button"
												onClick={() => void handleRevalidate()}
												disabled={busy === "revalidating"}
												className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:bg-foreground/5 disabled:opacity-60"
											>
												{busy === "revalidating"
													? t(
															"common.yanjing.account.revalidating",
															"校验中…",
														)
													: t(
															"common.yanjing.account.revalidate",
															"重新校验",
														)}
											</button>
										</div>
									)}

									{/* 备份 / 恢复：Pro 权限只活在本机，必须给用户一条存下来的路 */}
									{isProActive && status.licenseKey && (
										<div className="mt-4 space-y-2 border-t border-border/70 pt-3">
											<div className="flex items-center gap-2">
												<button
													type="button"
													onClick={handleExportBackup}
													className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:bg-foreground/5"
												>
													<DownloadSimple size={12} />
													{t(
														"common.yanjing.account.backupExport",
														"备份到文件",
													)}
												</button>
												<button
													type="button"
													onClick={() => restoreInputRef.current?.click()}
													disabled={busy === "activating"}
													className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:bg-foreground/5 disabled:opacity-60"
												>
													<UploadSimple size={12} />
													{t(
														"common.yanjing.account.backupImport",
														"从文件恢复",
													)}
												</button>
											</div>
											<p className="text-[11px] leading-relaxed text-muted-foreground">
												{t(
													"common.yanjing.account.backupHint",
													"许可证只保存在这台机器上。备份成文件后，重装或换机可以直接恢复 Pro。",
												)}
											</p>
											<p className="text-[11px] leading-relaxed text-muted-foreground/80">
												{t(
													"common.yanjing.account.backupPlaintext",
													"备份文件里是明文的许可证密钥，请像保管密码一样保管它。",
												)}
											</p>
										</div>
									)}
								</div>
							</section>

							{/* ---------- 激活 / 停用 ---------- */}
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
										<div className="flex items-center justify-between gap-3">
											<button
												type="button"
												onClick={() => restoreInputRef.current?.click()}
												disabled={busy === "activating"}
												className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
											>
												<UploadSimple size={12} />
												{t(
													"common.yanjing.account.backupImport",
													"从文件恢复",
												)}
											</button>
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

							{/* ---------- 免费版 vs Pro ---------- */}
							<section className="space-y-3">
								<SectionTitle>
									{t("common.yanjing.account.planTitle", "免费版与 Pro 对照")}
								</SectionTitle>
								<div className="grid grid-cols-2 gap-3">
									{/* 左：免费版 */}
									<div className="rounded-lg border border-border px-3 py-3">
										<p className="text-sm font-semibold">
											{t("common.yanjing.account.planFreeName", "免费版")}
										</p>
										<p className="mt-0.5 text-[11px] text-muted-foreground">
											{t("common.yanjing.account.planFreePrice", "永久免费")}
										</p>
										<ul className="mt-2.5 space-y-1.5">
											{freeBenefits.map((benefit) => (
												<li
													key={benefit}
													className="flex items-start gap-1.5 text-[11px] leading-relaxed"
												>
													<Check
														size={12}
														weight="bold"
														className="mt-0.5 shrink-0"
														style={{ color: ACCENT }}
													/>
													<span className="text-muted-foreground">
														{benefit}
													</span>
												</li>
											))}
										</ul>
									</div>
									{/* 右：Pro（含左栏全部，另加 AI） */}
									<div
										className="rounded-lg border px-3 py-3"
										style={{
											borderColor: `${ACCENT}55`,
											background: `${ACCENT}0d`,
										}}
									>
										<p className="text-sm font-semibold">
											{t("common.yanjing.account.planProName", "Pro 版")}
										</p>
										<p className="mt-0.5 text-[11px] text-muted-foreground">
											{t(
												"common.yanjing.account.planProPrice",
												"${{price}} 一次性买断",
												{ price: KLQ_PRO_PRICE_USD.toFixed(1) },
											)}
										</p>
										<p className="mt-2.5 text-[11px] font-medium">
											{t(
												"common.yanjing.account.planProIncludes",
												"含免费版全部能力，另加：",
											)}
										</p>
										<ul className="mt-1.5 space-y-1.5">
											{benefits.map((benefit) => (
												<li
													key={benefit}
													className="flex items-start gap-1.5 text-[11px] leading-relaxed"
												>
													{isProActive ? (
														<CheckCircle
															size={12}
															weight="bold"
															className="mt-0.5 shrink-0"
															style={{ color: ACCENT }}
														/>
													) : (
														<Lock
															size={11}
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
									</div>
								</div>
								{/* 授权范围：只说代码里**真实存在**的行为，不编造设备数限制 */}
								<p className="text-[11px] leading-relaxed text-muted-foreground">
									{t(
										"common.yanjing.account.activationScope",
										"激活状态只保存在本机，不需要账号。换机器时在新机器粘贴同一个密钥即可，也可以先在旧机器点「停用」。",
									)}
								</p>
							</section>

							{/* ---------- AI 服务（BYO API key）---------- */}
							<AiServiceSection isProActive={isProActive} />

							{/* ---------- 购买与售后 ---------- */}
							{!isProActive && (
								<section className="space-y-3 border-t border-border pt-5">
									<SectionTitle>
										{t("common.yanjing.account.purchaseTitle", "购买与售后")}
									</SectionTitle>

									{checkoutReady ? (
										<ExternalLink
											href={KLQ_PRO_CHECKOUT_URL}
											className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3 transition-colors hover:bg-foreground/[0.03]"
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
										</ExternalLink>
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
											{/* 「未配置」不等于「不能买」：官网定价卡走的就是邮件下单，
											    应用内必须给出同一条路，否则想要付费的用户在这里被卡死。 */}
											<ExternalLink
												href={buildLicenseRequestMailto("purchase")}
												className="mt-2 inline-flex items-center gap-1 text-xs transition-colors hover:opacity-80"
												style={{ color: ACCENT }}
											>
												{t(
													"common.yanjing.account.buyByEmail",
													"邮件申请购买",
												)}
												<ArrowSquareOut size={12} />
											</ExternalLink>
										</div>
									)}

									<p className="text-[11px] leading-relaxed text-muted-foreground">
										{t(
											"common.yanjing.account.buySteps",
											"购买后 License key 会发到你的邮箱，回到这里粘贴激活即可。",
										)}
									</p>

									{/* 价格包含什么、不包含什么 —— 退款纠纷几乎都出在「我以为含」 */}
									<ul className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
										<li className="flex items-start gap-1.5">
											<Check
												size={11}
												weight="bold"
												className="mt-0.5 shrink-0"
												style={{ color: ACCENT }}
											/>
											<span>
												{t(
													"common.yanjing.account.includedLicense",
													"包含：Kliq Pro 的永久使用许可。",
												)}
											</span>
										</li>
										<li className="flex items-start gap-1.5">
											<Info
												size={11}
												className="mt-0.5 shrink-0 text-muted-foreground"
											/>
											<span>
												{t(
													"common.yanjing.account.excludedAi",
													"不包含：AI 服务费用。AI 动作调用你自己的 OpenAI / DeepSeek 账号，费用由你与该服务商结算。",
												)}
											</span>
										</li>
										<li className="flex items-start gap-1.5">
											<Info
												size={11}
												className="mt-0.5 shrink-0 text-muted-foreground"
											/>
											<span>
												{t(
													"common.yanjing.account.excludedTax",
													"不包含：税费与汇率差异，最终金额以结算页显示为准。",
												)}
											</span>
										</li>
									</ul>

									{/* 找回购买：key 只在购买时发一次邮件，此前没有任何取回入口 */}
									<div className="rounded-lg border border-border px-4 py-3">
										<p className="text-xs font-medium">
											{t(
												"common.yanjing.account.recoverTitle",
												"找回购买 / 重新获取密钥",
											)}
										</p>
										{/* 渠道必须与官网定价卡一致：结算页已配置才引导去订单页，
										    否则引导到一个「你没有任何订单」的页面等于把人劝退。 */}
										<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
											{checkoutReady
												? t(
														"common.yanjing.account.recoverHint",
														"找不到邮件了？用下单邮箱登录订单页，就能看到全部订单与许可证密钥（需要邮箱里点一下魔法链接）。",
													)
												: t(
														"common.yanjing.account.recoverHintEmail",
														"找不到邮件了？用下单时填的邮箱写一封邮件给我们，可以重新发一份密钥。",
													)}
										</p>
										<ExternalLink
											href={
												checkoutReady
													? KLQ_STORE_ORDERS_URL
													: buildLicenseRequestMailto("recover")
											}
											className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
										>
											{checkoutReady
												? t(
														"common.yanjing.account.recoverAction",
														"打开订单页",
													)
												: t(
														"common.yanjing.account.recoverActionEmail",
														"写邮件申请",
													)}
											<ArrowSquareOut size={11} />
										</ExternalLink>
									</div>

									{KLQ_REFUND_POLICY_URL && (
										<ExternalLink
											href={KLQ_REFUND_POLICY_URL}
											className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
										>
											{t("common.yanjing.account.refundPolicy", "退款政策")}
											<ArrowSquareOut size={11} />
										</ExternalLink>
									)}
								</section>
							)}

							{/* ---------- 商业化配置自检（未配置齐才出现）---------- */}
							{(buildConfigMissing.length > 0 || !checkoutReady) && (
								<section className="space-y-2 rounded-lg border border-dashed border-border px-4 py-3">
									<div className="flex items-start gap-2">
										<WarningCircle
											size={14}
											className="mt-0.5 shrink-0 text-muted-foreground"
										/>
										<p className="text-xs font-medium">
											{t(
												"common.yanjing.account.configTitle",
												"商业化配置未完成",
											)}
										</p>
									</div>
									{buildConfigMissing.length > 0 && (
										<>
											<p className="text-[11px] leading-relaxed text-muted-foreground">
												{t(
													"common.yanjing.account.configBuildHint",
													"以下构建期变量缺失：",
												)}
											</p>
											<ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
												{buildConfigMissing.map((item) => (
													<li key={item.key}>
														{item.key}
														<span className="ml-2 font-sans">
															— {item.effect}
														</span>
													</li>
												))}
											</ul>
										</>
									)}
									<p className="text-[11px] leading-relaxed text-muted-foreground">
										{t(
											"common.yanjing.account.configServerHint",
											"另外三项只在服务端生效、应用内无法检测，需配在 Cloudflare Pages 的环境变量里：",
										)}
									</p>
									<p className="font-mono text-[11px] text-muted-foreground">
										{serverConfigKeys.join(" · ")}
									</p>
								</section>
							)}
						</div>

						{/* 底部：源码 / 反馈 / 许可说明 */}
						<footer className="border-t border-border px-6 py-4">
							<div className="flex items-center gap-4">
								<ExternalLink
									href={KLQ_REPO_URL}
									className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
								>
									<ArrowSquareOut size={13} />
									{t("common.yanjing.account.sourceCode", "源码")}
								</ExternalLink>
								<ExternalLink
									href={KLQ_ISSUES_URL}
									className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
								>
									<ArrowSquareOut size={13} />
									{t("common.yanjing.account.feedback", "反馈问题")}
								</ExternalLink>
							</div>
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
