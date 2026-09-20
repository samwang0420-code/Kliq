/**
 * Kliq — 「AI 服务」配置区块（个人中心内）
 *
 * 为什么需要它：Pro 权益的全部 AI 动作都通过 `getApiKey(provider)` 读取用户自己的
 * API key（BYO key 模式，我们的服务器不接触任何密钥）。但此前**没有任何界面能写入
 * 这个 key** —— `apiKeys.ts` 导出了完整的 set/delete/validate API 却零调用，
 * 结果是付过钱的用户点任何一个 AI 功能都只能看到「API key 未配置」。
 * 这个区块就是那个缺失的入口。
 *
 * 设计约束（沿用个人中心）：白底、宽松留白、专业图标（无 emoji）、主按钮右对齐。
 *
 * 两个后端的能力边界（这是物理事实，不是取舍）：
 *   - OpenAI    : Whisper 转录 + 全部文本动作（音频转写只有 OpenAI 系提供）
 *   - DeepSeek  : 仅文本动作（章节/摘要/标题/标签/社媒文案/翻译/校对），无 audio 端点
 * 语义搜索额外依赖 embeddings 端点，固定需要 OpenAI。
 */

import {
	Check,
	CircleNotch,
	Eye,
	EyeSlash,
	Key,
	Trash,
	WarningCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { type ChatProvider, getChatProvider, setChatProvider } from "@/lib/ai/provider";
import {
	type ApiKeyEntry,
	type ApiProvider,
	deleteApiKey,
	getApiKey,
	maskApiKey,
	setApiKey,
	validateApiKeyFormat,
} from "@/lib/apiKeys";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const ACCENT = "#22c55e";

/** 只列真正被代码消费的两个后端；anthropic / custom 目前没有读取路径，不展示以免误导 */
const PROVIDERS: readonly {
	id: ChatProvider;
	label: string;
	baseUrlPlaceholder: string;
	modelPlaceholder: string;
	scopeKey: string;
	scopeFallback: string;
}[] = [
	{
		id: "openai",
		label: "OpenAI",
		baseUrlPlaceholder: "https://api.openai.com/v1",
		modelPlaceholder: "gpt-4o-mini",
		scopeKey: "common.yanjing.account.ai.scopeOpenai",
		scopeFallback: "转录 + 全部文本动作",
	},
	{
		id: "deepseek",
		label: "DeepSeek",
		baseUrlPlaceholder: "https://api.deepseek.com/v1",
		modelPlaceholder: "deepseek-chat",
		scopeKey: "common.yanjing.account.ai.scopeDeepseek",
		scopeFallback: "仅文本动作（无语音转写）",
	},
];

type ElectronSettingsLike = {
	getAppSetting?: (key: string) => unknown;
	setAppSetting?: (key: string, value: unknown) => boolean;
};

function settingsAvailable(): boolean {
	const api = (globalThis as typeof globalThis & { electronAPI?: ElectronSettingsLike })
		.electronAPI;
	return typeof api?.getAppSetting === "function" && typeof api?.setAppSetting === "function";
}

function ProviderCard({
	provider,
	isProActive,
}: {
	provider: (typeof PROVIDERS)[number];
	isProActive: boolean;
}) {
	const { t } = useI18n();
	const [entry, setEntry] = useState<ApiKeyEntry | null>(null);
	const [key, setKey] = useState("");
	const [baseUrl, setBaseUrl] = useState("");
	const [model, setModel] = useState("");
	const [reveal, setReveal] = useState(false);
	const [busy, setBusy] = useState<"save" | "remove" | null>(null);

	const reload = useCallback(() => {
		const current = getApiKey(provider.id as ApiProvider);
		setEntry(current);
		setKey("");
		setBaseUrl(current?.baseUrl ?? "");
		setModel(current?.model ?? "");
	}, [provider.id]);

	useEffect(() => {
		reload();
	}, [reload]);

	const handleSave = useCallback(() => {
		const trimmed = key.trim();
		if (!trimmed) {
			toast.error(t("common.yanjing.account.ai.emptyKey", "请输入 API Key"));
			return;
		}
		if (!validateApiKeyFormat(provider.id, trimmed)) {
			toast.error(
				t(
					"common.yanjing.account.ai.invalidFormat",
					"格式看起来不对：{{provider}} 的 key 通常以 sk- 开头且长度不少于 20。",
					{ provider: provider.label },
				),
			);
			return;
		}
		setBusy("save");
		try {
			const result = setApiKey({
				provider: provider.id,
				apiKey: trimmed,
				baseUrl: baseUrl.trim() || undefined,
				model: model.trim() || undefined,
				updatedAt: Date.now(),
			});
			if (!result.success) {
				toast.error(result.error ?? t("common.yanjing.account.ai.saveFailed", "保存失败"));
				return;
			}
			toast.success(t("common.yanjing.account.ai.saved", "已保存 · 密钥仅存本机"));
			reload();
		} finally {
			setBusy(null);
		}
	}, [key, baseUrl, model, provider, t, reload]);

	const handleRemove = useCallback(() => {
		setBusy("remove");
		try {
			deleteApiKey(provider.id as ApiProvider);
			toast.success(t("common.yanjing.account.ai.removed", "已移除该服务的密钥"));
			reload();
		} finally {
			setBusy(null);
		}
	}, [provider.id, t, reload]);

	const configured = entry !== null;

	return (
		<div
			className="rounded-lg border px-4 py-4"
			style={
				configured ? { borderColor: `${ACCENT}55`, background: `${ACCENT}0d` } : undefined
			}
		>
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2.5">
					<span
						className="h-2 w-2 rounded-full"
						style={{
							background: configured ? ACCENT : "hsl(var(--muted-foreground))",
						}}
					/>
					<span className="text-sm font-semibold">{provider.label}</span>
					<span className="text-xs text-muted-foreground">
						{t(provider.scopeKey, provider.scopeFallback)}
					</span>
				</div>
				{configured ? (
					<span
						className="rounded-full px-2 py-0.5 text-[11px] font-medium"
						style={{ background: `${ACCENT}1f`, color: ACCENT }}
					>
						{t("common.yanjing.account.ai.configured", "已配置")}
					</span>
				) : (
					<span className="text-[11px] text-muted-foreground">
						{t("common.yanjing.account.ai.notConfigured", "未配置")}
					</span>
				)}
			</div>

			{configured && entry?.apiKey && (
				<p className="mt-2 font-mono text-xs text-muted-foreground">
					{maskApiKey(entry.apiKey)}
				</p>
			)}

			<div className="mt-3 space-y-2">
				<label className="block">
					<span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
						{t("common.yanjing.account.ai.keyLabel", "API Key")}
					</span>
					<div className="flex items-center gap-2">
						<div className="relative flex-1">
							<Key
								size={13}
								className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
							/>
							<input
								type={reveal ? "text" : "password"}
								value={key}
								onChange={(event) => setKey(event.target.value)}
								placeholder={configured ? "••••••••" : "sk-…"}
								spellCheck={false}
								autoComplete="off"
								className={cn(
									"w-full rounded-md border border-input bg-background py-2 pl-8 pr-8",
									"font-mono text-xs outline-none transition-colors focus:border-foreground/30",
								)}
							/>
							<button
								type="button"
								onClick={() => setReveal((v) => !v)}
								aria-label={t(
									"common.yanjing.account.ai.toggleReveal",
									"显示 / 隐藏密钥",
								)}
								className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
							>
								{reveal ? <EyeSlash size={13} /> : <Eye size={13} />}
							</button>
						</div>
					</div>
				</label>

				<div className="grid grid-cols-2 gap-2">
					<label className="block">
						<span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
							{t("common.yanjing.account.ai.baseUrlLabel", "接口地址")}
						</span>
						<input
							type="text"
							value={baseUrl}
							onChange={(event) => setBaseUrl(event.target.value)}
							placeholder={provider.baseUrlPlaceholder}
							spellCheck={false}
							className={cn(
								"w-full rounded-md border border-input bg-background px-2.5 py-2",
								"font-mono text-[11px] outline-none transition-colors focus:border-foreground/30",
							)}
						/>
					</label>
					<label className="block">
						<span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
							{t("common.yanjing.account.ai.modelLabel", "模型")}
						</span>
						<input
							type="text"
							value={model}
							onChange={(event) => setModel(event.target.value)}
							placeholder={provider.modelPlaceholder}
							spellCheck={false}
							className={cn(
								"w-full rounded-md border border-input bg-background px-2.5 py-2",
								"font-mono text-[11px] outline-none transition-colors focus:border-foreground/30",
							)}
						/>
					</label>
				</div>

				<div className="flex items-center justify-end gap-2 pt-1">
					{configured && (
						<button
							type="button"
							onClick={handleRemove}
							disabled={busy !== null}
							className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-foreground/5 disabled:opacity-60"
						>
							{busy === "remove" ? (
								<CircleNotch size={13} className="animate-spin" />
							) : (
								<Trash size={13} />
							)}
							{t("common.yanjing.account.ai.remove", "移除")}
						</button>
					)}
					<button
						type="button"
						onClick={handleSave}
						disabled={busy !== null || !isProActive}
						title={
							isProActive
								? undefined
								: t("common.yanjing.account.ai.needPro", "需先激活 Pro 版")
						}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-medium text-white transition-opacity",
							busy !== null || !isProActive ? "opacity-55" : "hover:opacity-90",
						)}
						style={{ background: ACCENT }}
					>
						{busy === "save" ? (
							<CircleNotch size={13} className="animate-spin" />
						) : (
							<Check size={13} weight="bold" />
						)}
						{t("common.yanjing.account.ai.save", "保存")}
					</button>
				</div>
			</div>
		</div>
	);
}

export function AiServiceSection({ isProActive }: { isProActive: boolean }) {
	const { t } = useI18n();
	const available = settingsAvailable();
	const [backend, setBackend] = useState<ChatProvider>(() => getChatProvider());

	useEffect(() => {
		setBackend(getChatProvider());
	}, []);

	const handleBackend = useCallback(
		(next: ChatProvider) => {
			const result = setChatProvider(next);
			if (!result.success) {
				toast.error(result.error ?? t("common.yanjing.account.ai.saveFailed", "保存失败"));
				return;
			}
			setBackend(next);
		},
		[t],
	);

	return (
		<section className="space-y-3">
			<div className="flex items-center justify-between">
				<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{t("common.yanjing.account.ai.title", "AI 服务")}
				</span>
				{!isProActive && (
					<span className="text-[11px] text-muted-foreground">
						{t("common.yanjing.account.ai.needPro", "需先激活 Pro 版")}
					</span>
				)}
			</div>

			{!available && (
				<div className="flex items-start gap-2 rounded-lg border border-dashed border-border px-3 py-2.5">
					<WarningCircle size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
					<p className="text-xs leading-relaxed text-muted-foreground">
						{t(
							"common.yanjing.account.ai.unavailable",
							"当前环境无法读写本地设置：密钥只能保存在桌面端（Electron），浏览器预览里配置不会生效。",
						)}
					</p>
				</div>
			)}

			<p className="text-xs leading-relaxed text-muted-foreground">
				{t(
					"common.yanjing.account.ai.hint",
					"AI 动作调用的是你自己的 AI 账号，我们不代付、也拿不到你的密钥 —— 它只写在本机设置里。",
				)}
			</p>

			{/* 文本动作走哪个后端 */}
			<div className="space-y-2">
				<span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
					{t("common.yanjing.account.ai.backendLabel", "文本动作后端")}
				</span>
				<div className="flex gap-2">
					{PROVIDERS.map((option) => {
						const active = backend === option.id;
						return (
							<button
								key={option.id}
								type="button"
								onClick={() => handleBackend(option.id)}
								className={cn(
									"flex-1 rounded-md border px-3 py-2 text-xs transition-colors",
									active
										? "font-medium text-foreground"
										: "border-border text-muted-foreground hover:bg-foreground/5",
								)}
								style={
									active
										? { borderColor: `${ACCENT}88`, background: `${ACCENT}14` }
										: undefined
								}
							>
								{option.label}
							</button>
						);
					})}
				</div>
				<p className="text-[11px] leading-relaxed text-muted-foreground">
					{t(
						"common.yanjing.account.ai.backendHint",
						"转录固定走 OpenAI（Whisper）；本章切换只影响章节 / 摘要 / 翻译 / 校对等文本动作。未配置的项会自动回退到另一个。",
					)}
				</p>
			</div>

			{PROVIDERS.map((provider) => (
				<ProviderCard key={provider.id} provider={provider} isProActive={isProActive} />
			))}
		</section>
	);
}

export default AiServiceSection;
