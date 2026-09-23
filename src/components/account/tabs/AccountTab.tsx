import { ArrowSquareOut, Copy, DownloadSimple, Info, UploadSimple } from "@phosphor-icons/react";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { useLicenseStatus } from "@/hooks/useLicenseStatus";
import { activateLicense, deactivateLicense, maskLicenseKey } from "@/lib/license";
import {
	buildLicenseBackup,
	type LicenseBackupErrorReason,
	parseLicenseBackup,
	serializeLicenseBackup,
	suggestLicenseBackupFileName,
} from "@/lib/licenseBackup";
import { isLicenseServiceConfigured, KLQ_LICENSE_REQUEST_EMAIL } from "@/lib/licenseConfig";
import { toast } from "@/lib/toast";

const ACCENT = "#22c55e";

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

const FEATURE_LABEL_FALLBACKS: Record<string, string> = {
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

export function AccountTab(): ReactNode {
	const t = useScopedT("common");
	const status = useLicenseStatus();
	const isProActive = status.activated && status.tier === "pro";

	const [licenseKey, setLicenseKey] = useState("");
	const [busy, setBusy] = useState<"activating" | "deactivating" | "revalidating" | null>(null);
	const restoreInputRef = useRef<HTMLInputElement | null>(null);

	const handleActivate = useCallback(async () => {
		const key = licenseKey.trim();
		if (!key) {
			toast.error(t("yanjing.license.emptyKey", "请输入 License key"));
			return;
		}
		setBusy("activating");
		try {
			const result = await activateLicense(key);
			if (!result.success) {
				toast.error(result.error ?? t("yanjing.license.invalidKey", "无效的许可证密钥"));
				return;
			}
			setLicenseKey("");
			if (result.notice) {
				toast.warning(result.notice);
			} else {
				toast.success(t("yanjing.license.activatedSuccess", "激活成功!"));
			}
		} finally {
			setBusy(null);
		}
	}, [licenseKey, t]);

	const handleDeactivate = useCallback(() => {
		setBusy("deactivating");
		try {
			const previous = status.licenseKey ?? "";
			deactivateLicense();
			setLicenseKey(previous);
			toast.success(t("yanjing.license.deactivated", "License 已停用"));
		} finally {
			setBusy(null);
		}
	}, [t, status.licenseKey]);

	const handleCopyKey = useCallback(() => {
		const key = status.licenseKey;
		if (!key) return;
		void navigator.clipboard
			.writeText(key)
			.then(() => toast.success(t("yanjing.account.copied", "已复制")))
			.catch(() => toast.error(t("yanjing.account.copyFail", "复制失败，请手动抄写许可证")));
	}, [status.licenseKey, t]);

	const handleRevalidate = useCallback(async () => {
		const key = status.licenseKey;
		if (!key) return;
		setBusy("revalidating");
		try {
			const result = await activateLicense(key);
			if (!result.success) {
				toast.error(result.error ?? t("yanjing.account.revalidateFail", "校验失败"));
				return;
			}
			if (result.notice) {
				toast.warning(
					t("yanjing.account.revalidateOffline", "校验服务不可用，仍为离线状态"),
				);
				return;
			}
			toast.success(t("yanjing.account.revalidateOk", "已与服务器确认，Pro 状态已更新"));
		} finally {
			setBusy(null);
		}
	}, [status.licenseKey, t]);

	const handleExportBackup = useCallback(() => {
		const key = status.licenseKey;
		if (!key) return;
		try {
			const backup = buildLicenseBackup({
				licenseKey: key,
				activatedAt: status.activatedAt,
			});
			const blob = new Blob([serializeLicenseBackup(backup)], {
				type: "application/json",
			});
			const objectUrl = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = objectUrl;
			anchor.download = suggestLicenseBackupFileName();
			document.body.appendChild(anchor);
			anchor.click();
			document.body.removeChild(anchor);
			window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
			toast.success(t("yanjing.account.backupExported", "已导出备份文件"));
		} catch {
			toast.error(t("yanjing.account.backupFailed", "导出失败，请改用上方的复制密钥"));
		}
	}, [status, t]);

	const handleRestoreFile = useCallback(
		async (file: File) => {
			try {
				const text = await file.text();
				const parsed = parseLicenseBackup(text);
				if (!parsed.ok) {
					const msg = BACKUP_REASON_MESSAGES[parsed.reason];
					toast.error(t(msg.key, msg.fallback));
					return;
				}
				const licenseKey = parsed.backup.licenseKey;
				const result = await activateLicense(licenseKey);
				if (!result.success) {
					toast.error(
						result.error ?? t("yanjing.license.invalidKey", "无效的许可证密钥"),
					);
					return;
				}
				toast.success(t("yanjing.account.backupRestored", "已从备份恢复，Pro 已重新激活"));
			} catch {
				toast.error(
					t("yanjing.account.backupReadFailed", "无法读取该文件，请确认它不是加密的"),
				);
			}
		},
		[t],
	);

	const machineName =
		typeof navigator !== "undefined"
			? ((navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
				"Mac")
			: "Unknown";

	return (
		<div className="space-y-6">
			<section className="space-y-3">
				<div className="flex items-center justify-between">
					<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						{t("yanjing.account.deviceLicense", "本机许可")}
					</h3>
					{isProActive && (
						<span
							className="rounded-full px-2 py-0.5 text-[11px] font-medium"
							style={{ background: `${ACCENT}1f`, color: ACCENT }}
						>
							{t("yanjing.license.lifetime", "买断 · 永久使用")}
						</span>
					)}
				</div>

				<div
					className="rounded-lg border px-4 py-4"
					style={
						isProActive
							? { borderColor: `${ACCENT}55`, background: `${ACCENT}0d` }
							: { borderColor: "hsl(var(--border))" }
					}
				>
					<div className="flex items-center gap-2.5">
						<span
							className="h-2 w-2 rounded-full"
							style={{
								background: isProActive ? ACCENT : "hsl(var(--muted-foreground))",
							}}
						/>
						<span className="text-sm font-semibold">
							{isProActive
								? t("yanjing.license.pro", "Pro 版")
								: t("yanjing.license.free", "免费版")}
						</span>
						<span className="text-xs text-muted-foreground">
							{isProActive
								? t("yanjing.license.activated", "已激活")
								: t("yanjing.license.notActivated", "未激活")}
						</span>
					</div>

					<dl className="mt-3 space-y-1.5 text-xs text-muted-foreground">
						{isProActive && status.licenseKey && (
							<div className="flex items-center justify-between gap-4">
								<dt>{t("yanjing.account.currentKey", "当前许可证")}</dt>
								<dd className="flex items-center gap-1.5">
									<span className="font-mono">
										{maskLicenseKey(status.licenseKey)}
									</span>
									<button
										type="button"
										onClick={handleCopyKey}
										title={t("yanjing.account.copyKey", "复制密钥")}
										aria-label={t("yanjing.account.copyKey", "复制密钥")}
										className="rounded p-0.5 transition-colors hover:bg-foreground/5 hover:text-foreground"
									>
										<Copy size={11} />
									</button>
								</dd>
							</div>
						)}
						{isProActive && status.activatedAt && (
							<div className="flex justify-between gap-4">
								<dt>{t("yanjing.account.activatedAt", "激活时间")}</dt>
								<dd>{new Date(status.activatedAt).toLocaleDateString()}</dd>
							</div>
						)}
						<div className="flex justify-between gap-4">
							<dt>{t("yanjing.account.service", "许可校验服务")}</dt>
							<dd>
								{isLicenseServiceConfigured()
									? t("yanjing.account.serviceOnline", "已连接")
									: t("yanjing.account.serviceOffline", "未配置（仅离线校验）")}
							</dd>
						</div>
					</dl>

					{isProActive && status.offline && (
						<div className="mt-3 flex items-start justify-between gap-3">
							<p className="text-xs leading-relaxed text-muted-foreground">
								{t(
									"yanjing.account.offlineNote",
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
									? t("yanjing.account.revalidating", "校验中…")
									: t("yanjing.account.revalidate", "重新校验")}
							</button>
						</div>
					)}

					{isProActive && status.licenseKey && (
						<div className="mt-4 space-y-2 border-t border-border/70 pt-3">
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={handleExportBackup}
									className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:bg-foreground/5"
								>
									<DownloadSimple size={12} />
									{t("yanjing.account.backupExport", "备份到文件")}
								</button>
								<button
									type="button"
									onClick={() => restoreInputRef.current?.click()}
									disabled={busy === "activating"}
									className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:bg-foreground/5 disabled:opacity-60"
								>
									<UploadSimple size={12} />
									{t("yanjing.account.backupImport", "从文件恢复")}
								</button>
							</div>
							<p className="text-[11px] leading-relaxed text-muted-foreground">
								{t(
									"yanjing.account.backupHint",
									"许可证只保存在这台机器上。备份成文件后，重装或换机可以直接恢复 Pro。",
								)}
							</p>
							<p className="text-[11px] leading-relaxed text-muted-foreground/80">
								{t(
									"yanjing.account.backupPlaintext",
									"备份文件里是明文的许可证密钥，请像保管密码一样保管它。",
								)}
							</p>
						</div>
					)}
				</div>

				<input
					ref={restoreInputRef}
					type="file"
					accept=".json,application/json"
					className="hidden"
					aria-hidden="true"
					tabIndex={-1}
					onChange={(event) => {
						const file = event.target.files?.[0];
						event.target.value = "";
						if (file) void handleRestoreFile(file);
					}}
				/>
			</section>

			<section className="space-y-3">
				{!isProActive ? (
					<>
						<label
							htmlFor="kliq-license-key"
							className="block text-xs font-medium uppercase tracking-wide text-muted-foreground"
						>
							{t("yanjing.license.enterLicenseKey", "输入许可证密钥")}
						</label>
						<div className="flex items-stretch gap-2">
							<input
								id="kliq-license-key"
								type="text"
								value={licenseKey}
								onChange={(event) => setLicenseKey(event.target.value)}
								spellCheck={false}
								autoComplete="off"
								placeholder="kliq-pro-XXXX-XXXX"
								className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono outline-none transition-colors focus:border-foreground/30"
							/>
							<button
								type="button"
								onClick={() => void handleActivate()}
								disabled={busy !== null || !licenseKey.trim()}
								className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-foreground/5 disabled:opacity-60"
							>
								{busy === "activating"
									? t("yanjing.license.activating", "校验中…")
									: t("yanjing.license.activate", "激活")}
							</button>
						</div>
					</>
				) : (
					<button
						type="button"
						onClick={handleDeactivate}
						disabled={busy !== null}
						className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs transition-colors hover:bg-foreground/5 disabled:opacity-60"
					>
						{busy === "deactivating"
							? t("yanjing.license.deactivating", "停用中…")
							: t("yanjing.license.deactivate", "停用")}
					</button>
				)}
			</section>

			<section className="space-y-2">
				<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{t("yanjing.account.deviceInfo", "设备信息")}
				</h3>
				<dl className="space-y-1 text-xs text-muted-foreground">
					<div className="flex justify-between gap-4">
						<dt>{t("yanjing.account.machineName", "机器名")}</dt>
						<dd className="font-mono">{machineName}</dd>
					</div>
					<div className="flex justify-between gap-4">
						<dt>{t("yanjing.account.installedVersion", "安装版本")}</dt>
						<dd className="font-mono">v0.1.0</dd>
					</div>
				</dl>
			</section>

			<section className="rounded-lg border border-dashed border-border/60 px-4 py-3">
				<div className="flex items-start gap-2">
					<Info
						size={12}
						weight="bold"
						className="mt-0.5 shrink-0 text-muted-foreground"
					/>
					<p className="text-[11px] leading-relaxed text-muted-foreground">
						{t(
							"yanjing.account.licenseNote",
							"AGPL 3.0 · 基于 Recordly 修改 · 独立维护",
						)}
						{status.licenseKey && (
							<>
								{" · "}
								<a
									href={`mailto:${KLQ_LICENSE_REQUEST_EMAIL}?subject=Kliq%20License%20Inquiry`}
									className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
								>
									{KLQ_LICENSE_REQUEST_EMAIL}
									<ArrowSquareOut size={9} />
								</a>
							</>
						)}
					</p>
				</div>
			</section>
		</div>
	);
}

export default AccountTab;
