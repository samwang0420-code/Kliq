/**
 * Kliq — AI 工具栏 (P0/P1 全部 AI 功能的统一 UI 入口)
 *
 * 把 P0 A1/A2/B1/B2/B3/C1/C2/C3/G1 + P1 A3/A4/A5/B4/B5/C4/C5/D1/E/F/G2/G3/G4
 * 全部功能汇总到一个组件, 用户在导出/录制前/录制后都可调用
 *
 * ⚠️ 历史缺陷（本次修复）：本组件过去只声明了 `requiresFile` / `requiresTranscript`
 * 两个布尔位，且**全仓零消费**。唯一的调用方对所有动作一律只传 `{ file }`，于是 16 个
 * 动作里有 9 个需要 transcript / segments / query / sourceText 的，点下去必然抛错 ——
 * 实现都在、单测也过，但用户在 UI 上永远走不通。
 *
 * 输入的契约（谁需要什么）现在放在 `@/lib/ai/action-inputs`：纯逻辑、无 React、可单测，
 * 并由 `action-inputs.test.ts` 穷举钉住。本组件只负责**呈现** —— 图标、文案、
 * 禁用态与「还缺什么」的提示。
 */

import type { Icon } from "@phosphor-icons/react";
import {
	Article,
	Binoculars,
	CaretDown,
	CaretUp,
	CheckCircle,
	CircleNotch,
	ClosedCaptioning,
	Crop,
	Globe,
	Lightning,
	ListNumbers,
	MagicWand,
	Microphone,
	Scissors,
	ShareNetwork,
	Sparkle,
	SpeakerSlash,
	Tag,
	TextT,
} from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { useIsPro } from "@/hooks/useLicenseStatus";
import {
	AI_ACTION_IDS,
	AI_ACTION_SPECS,
	type AIAction,
	type AIActionGroup,
	type AIInput,
	AI_INPUT_HINT_FALLBACKS,
	type AIInputState,
	missingAIInputs,
} from "@/lib/ai/action-inputs";
import { actionRequiresPro } from "@/lib/license";
import { openAccountCenter } from "@/lib/proGate";
import { cn } from "@/lib/utils";

// 对外保持既有 import 路径可用（useAIActions / ExportSettingsMenu 从这里取类型）
export type { AIAction, AIActionGroup, AIInput, AIInputState } from "@/lib/ai/action-inputs";

export type AIProvider = "openai" | "anthropic" | "deepseek";

/** 动作的呈现信息。与逻辑契约（AI_ACTION_SPECS）分成两张表，各自由 Record 强制完整。 */
type AIActionPresentation = {
	labelKey: string;
	labelFallback: string;
	/** 专业线性图标（项目规范：界面不得使用 emoji 当图标） */
	Icon: Icon;
};

const AI_ACTION_PRESENTATION: Record<AIAction, AIActionPresentation> = {
	transcribe: {
		labelKey: "yanjing.ai.actions.transcribe",
		labelFallback: "AI Transcribe",
		Icon: Microphone,
	},
	"bilingual-captions": {
		labelKey: "yanjing.ai.actions.bilingual",
		labelFallback: "AI Bilingual Captions",
		Icon: ClosedCaptioning,
	},
	"ai-translate-multi": {
		labelKey: "yanjing.ai.actions.translateMulti",
		labelFallback: "AI Multi-language Captions",
		Icon: Globe,
	},
	"ai-proofread": {
		labelKey: "yanjing.ai.actions.proofread",
		labelFallback: "AI Caption Proofread",
		Icon: CheckCircle,
	},
	"ai-silence": {
		labelKey: "yanjing.ai.actions.silence",
		labelFallback: "AI Silence Removal",
		Icon: SpeakerSlash,
	},
	"ai-fillers": {
		labelKey: "yanjing.ai.actions.fillers",
		labelFallback: "AI Filler Removal",
		Icon: Scissors,
	},
	"ai-speed": {
		labelKey: "yanjing.ai.actions.speed",
		labelFallback: "AI Smart Speed",
		Icon: Lightning,
	},
	"ai-zoom": {
		labelKey: "yanjing.ai.actions.zoom",
		labelFallback: "AI Auto Zoom",
		Icon: Crop,
	},
	"ai-oneclick": {
		labelKey: "yanjing.ai.actions.oneclick",
		labelFallback: "AI One-click Edit",
		Icon: MagicWand,
	},
	"ai-chapters": {
		labelKey: "yanjing.ai.actions.chapters",
		labelFallback: "AI Chapters",
		Icon: ListNumbers,
	},
	"ai-summary": {
		labelKey: "yanjing.ai.actions.summary",
		labelFallback: "AI Summary",
		Icon: Article,
	},
	"ai-titles": {
		labelKey: "yanjing.ai.actions.titles",
		labelFallback: "AI Titles",
		Icon: TextT,
	},
	"ai-tags": {
		labelKey: "yanjing.ai.actions.tags",
		labelFallback: "AI Tags",
		Icon: Tag,
	},
	"ai-social": {
		labelKey: "yanjing.ai.actions.social",
		labelFallback: "AI Social Copy",
		Icon: ShareNetwork,
	},
	"ai-semantic-search": {
		labelKey: "yanjing.ai.actions.search",
		labelFallback: "AI Semantic Search",
		Icon: Binoculars,
	},
	"ai-ui-polish": {
		labelKey: "yanjing.ai.actions.uiPolish",
		labelFallback: "UI Polish",
		Icon: Sparkle,
	},
};

export type AIActionDef = AIActionPresentation & {
	id: AIAction;
	group: AIActionGroup;
	needs: AIInput[];
};

/** 逻辑契约 + 呈现信息合并后的动作清单（顺序由 AI_ACTION_IDS 决定） */
export const AI_ACTIONS: AIActionDef[] = AI_ACTION_IDS.map((id) => ({
	id,
	...AI_ACTION_SPECS[id],
	...AI_ACTION_PRESENTATION[id],
}));

const AI_ACTIONS_BY_ID = new Map<AIAction, AIActionDef>(AI_ACTIONS.map((def) => [def.id, def]));

/** 取动作定义（调用方组装 params 时复用） */
export function getAIActionDef(id: AIAction): AIActionDef | undefined {
	return AI_ACTIONS_BY_ID.get(id);
}

export type AIHotwordDomain =
	| "general"
	| "legal"
	| "medical"
	| "ecommerce"
	| "education"
	| "finance"
	| "gaming"
	| "tech"
	| "marketing";

export type AIToolbarProps = {
	selectedDomain: AIHotwordDomain;
	onDomainChange: (d: AIHotwordDomain) => void;
	availableDomains: AIHotwordDomain[];
	onAction: (action: AIAction) => void;
	busy?: AIAction | null;
	disabled?: boolean;
	/** 当前可用的输入（由宿主组件维护，转写成功后自动填充） */
	inputs: AIInputState;
	/** 文本类输入的变更回调 */
	onInputChange: (
		patch: Partial<Pick<AIInputState, "transcript" | "query" | "sourceText">>,
	) => void;
};

const GROUP_ORDER: AIActionGroup[] = ["transcribe", "edit", "generate", "translate", "search"];

export function AIToolbar({
	selectedDomain,
	onDomainChange,
	availableDomains,
	onAction,
	busy,
	disabled,
	inputs,
	onInputChange,
}: AIToolbarProps) {
	const t = useScopedT("editor");
	const [expanded, setExpanded] = useState(false);
	const isPro = useIsPro();

	const groups = GROUP_ORDER.map((group) => ({
		group,
		actions: AI_ACTIONS.filter((action) => action.group === group),
	})).filter((entry) => entry.actions.length > 0);

	const hintFor = useCallback(
		(input: AIInput) => t(`yanjing.ai.inputHints.${input}`, AI_INPUT_HINT_FALLBACKS[input]),
		[t],
	);

	// 只有存在需要转录文本的动作时才渲染那个输入框，避免空占位
	const needsTranscript = AI_ACTION_IDS.some((id) =>
		AI_ACTION_SPECS[id].needs.some((need) => need === "transcript" || need === "segments"),
	);

	return (
		<div className="mt-3 rounded-lg border border-border bg-editor-surface p-3 text-foreground">
			<div className="mb-2 flex items-center justify-between gap-3">
				<div className="text-sm font-semibold tracking-tight">
					{t("yanjing.ai.toolbarTitle", "AI Enhance")}
				</div>
				<div className="flex items-center gap-1.5">
					{/* 个人中心入口：未激活时也要能点进来激活 / 购买 */}
					<button
						type="button"
						onClick={() => openAccountCenter()}
						title={t("yanjing.ai.proEntryHint", "Manage license & Pro benefits")}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
							isPro
								? "border-green-500/40 bg-green-500/10 text-green-600"
								: "border-border text-muted-foreground hover:text-foreground",
						)}
					>
						<span
							className={cn(
								"h-1.5 w-1.5 rounded-full",
								isPro ? "bg-green-500" : "bg-muted-foreground",
							)}
						/>
						{t(
							isPro ? "yanjing.ai.proActive" : "yanjing.ai.proEntry",
							isPro ? "Pro" : "Pro / Account",
						)}
					</button>
					<button
						type="button"
						onClick={() => setExpanded(!expanded)}
						className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
					>
						{expanded ? <CaretUp size={11} /> : <CaretDown size={11} />}
						{t(
							expanded ? "yanjing.ai.toolbarCollapse" : "yanjing.ai.toolbarExpand",
							expanded ? "Collapse" : "Expand",
						)}
					</button>
				</div>
			</div>

			<div className="mb-2 flex items-center gap-2">
				<label htmlFor="kliq-ai-hotwords" className="text-xs text-muted-foreground">
					{t("yanjing.ai.toolbarHotwords", "Hotwords:")}
				</label>
				<select
					id="kliq-ai-hotwords"
					value={selectedDomain}
					onChange={(e) => onDomainChange(e.target.value as AIHotwordDomain)}
					disabled={disabled}
					className="rounded-md border border-input bg-background px-2 py-0.5 text-xs outline-none transition-colors focus:border-foreground/30 disabled:opacity-60"
				>
					{availableDomains.map((d) => (
						<option key={d} value={d}>
							{t(`yanjing.ai.domains.${d}`)}
						</option>
					))}
				</select>
			</div>

			{expanded && (
				<div className="flex flex-col gap-3">
					{/* 输入区：文本类动作的「入口」。缺了它，9 个动作点下去必然报错。 */}
					<div className="space-y-2 rounded-md border border-dashed border-border p-2.5">
						<div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
							{t("yanjing.ai.inputsTitle", "AI Inputs")}
						</div>

						{needsTranscript && (
							<label className="block">
								<span className="mb-1 block text-xs text-muted-foreground">
									{t("yanjing.ai.transcriptLabel", "Transcript")}
								</span>
								<textarea
									value={inputs.transcript}
									onChange={(e) => onInputChange({ transcript: e.target.value })}
									rows={3}
									spellCheck={false}
									placeholder={t(
										"yanjing.ai.transcriptPlaceholder",
										"Run “AI Transcribe” or paste the transcript here",
									)}
									className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none transition-colors focus:border-foreground/30"
								/>
								{inputs.segmentCount > 0 && (
									<span className="mt-0.5 block text-[11px] text-muted-foreground">
										{t(
											"yanjing.ai.segmentReady",
											"{{count}} timed captions ready",
											{ count: inputs.segmentCount },
										)}
									</span>
								)}
							</label>
						)}

						<label className="block">
							<span className="mb-1 block text-xs text-muted-foreground">
								{t("yanjing.ai.queryLabel", "Search query")}
							</span>
							<input
								type="text"
								value={inputs.query}
								onChange={(e) => onInputChange({ query: e.target.value })}
								spellCheck={false}
								placeholder={t(
									"yanjing.ai.queryPlaceholder",
									"e.g. where did it go wrong",
								)}
								className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none transition-colors focus:border-foreground/30"
							/>
						</label>

						<label className="block">
							<span className="mb-1 block text-xs text-muted-foreground">
								{t("yanjing.ai.sourceTextLabel", "Text to polish")}
							</span>
							<textarea
								value={inputs.sourceText}
								onChange={(e) => onInputChange({ sourceText: e.target.value })}
								rows={2}
								spellCheck={false}
								placeholder={t(
									"yanjing.ai.sourceTextPlaceholder",
									"Paste the copy you want polished",
								)}
								className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none transition-colors focus:border-foreground/30"
							/>
						</label>
					</div>

					{groups.map(({ group, actions }) => (
						<div key={group}>
							<div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
								{t(`yanjing.ai.groups.${group}`)}
							</div>
							<div className="flex flex-wrap gap-1.5">
								{actions.map((action) => {
									const gated = actionRequiresPro(action.id) && !isPro;
									const missing = missingAIInputs(action.id, inputs);
									const notReady = missing.length > 0;
									const actionDisabled =
										disabled || busy === action.id || notReady;
									const title = gated
										? t("yanjing.ai.proLocked", "Pro feature")
										: notReady
											? missing.map(hintFor).join(" · ")
											: action.labelFallback;
									const ActionIcon = action.Icon;
									return (
										<button
											key={action.id}
											type="button"
											onClick={() => onAction(action.id)}
											disabled={actionDisabled}
											title={title}
											className={cn(
												"inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors",
												gated ? "border-dashed" : "border-solid",
												notReady
													? "border-border text-muted-foreground/60"
													: "border-border hover:bg-foreground/5",
												actionDisabled && "cursor-not-allowed opacity-70",
												busy === action.id && "bg-muted",
											)}
										>
											{busy === action.id ? (
												<CircleNotch size={13} className="animate-spin" />
											) : (
												<ActionIcon size={13} />
											)}
											{t(action.labelKey, action.labelFallback)}
											{gated && (
												<span className="rounded-full border border-border bg-muted px-1.5 py-px text-[9px] font-bold tracking-wide text-muted-foreground">
													{t("yanjing.ai.proBadge", "PRO")}
												</span>
											)}
										</button>
									);
								})}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
