/**
 * Kliq — AI 增强 helpers (§57-2)
 *
 * 抽出 AIEnhancePanel.tsx 的映射 / 格式化纯函数, 方便单测覆盖.
 * 这些函数全部 stateless, 不依赖 React.
 */

import type { AIAction } from "@/lib/ai/action-inputs";
import type { ScenarioTemplate } from "@/lib/presets";

/**
 * scenario.features (中文 label 数组) -> 有序 AIAction 列表.
 * 未匹配的 label 静默丢弃 (防御 typo, 单测覆盖).
 */
export const FEATURE_LABEL_TO_ACTION: Readonly<Record<string, AIAction>> = {
	"AI 去静音": "ai-silence",
	"AI 去填充词": "ai-fillers",
	"AI 智能加速": "ai-speed",
	"AI 自动取景": "ai-zoom",
	"AI 一键剪辑": "ai-oneclick",
	"AI 章节": "ai-chapters",
	"AI 摘要": "ai-summary",
	"AI 标题": "ai-titles",
	"AI 标题备选": "ai-titles",
	"AI 标签": "ai-tags",
	"AI 字幕": "bilingual-captions",
	"AI 双向字幕": "bilingual-captions",
	"AI 校对": "ai-proofread",
	"AI 多语言字幕": "ai-translate-multi",
	"AI 社媒文案": "ai-social",
};

export function resolveScenarioActions(scenario: ScenarioTemplate): AIAction[] {
	const out: AIAction[] = [];
	const seen = new Set<AIAction>();
	for (const label of scenario.features) {
		const action = FEATURE_LABEL_TO_ACTION[label];
		if (action && !seen.has(action)) {
			out.push(action);
			seen.add(action);
		}
	}
	return out;
}

export const ACTION_LABEL_ZH: Readonly<Record<AIAction, string>> = {
	transcribe: "Whisper 转录",
	"bilingual-captions": "双语字幕",
	"ai-silence": "AI 去静音",
	"ai-fillers": "AI 去填充词",
	"ai-speed": "AI 智能加速",
	"ai-zoom": "AI 自动取景",
	"ai-oneclick": "AI 一键剪辑",
	"ai-chapters": "AI 章节",
	"ai-summary": "AI 摘要",
	"ai-titles": "AI 标题",
	"ai-tags": "AI 标签",
	"ai-social": "AI 社媒文案",
	"ai-translate-multi": "AI 多语言字幕",
	"ai-proofread": "AI 校对",
	"ai-semantic-search": "AI 语义搜索",
	"ai-ui-polish": "AI UI 润色",
};

export function shortLabelForAction(action: AIAction): string {
	return ACTION_LABEL_ZH[action];
}

/** 格式化 elapsed: <1s / 12s / 1m23s */
export function formatElapsed(ms: number): string {
	if (ms < 1000) return Math.floor(ms / 100) / 10 + "s";
	const sec = Math.floor(ms / 1000);
	if (sec < 60) return sec + "s";
	const min = Math.floor(sec / 60);
	const remain = sec % 60;
	const remainStr = remain < 10 ? "0" + remain : "" + remain;
	return min + "m" + remainStr + "s";
}

/** 格式化剩余 ms (用于 ProgressBar 第二行) */
export function formatRemain(ms: number): string {
	if (ms <= 0) return "完成";
	const sec = Math.max(1, Math.floor(ms / 1000));
	if (sec < 60) return sec + "s";
	const min = Math.floor(sec / 60);
	const remain = sec % 60;
	const remainStr = remain < 10 ? "0" + remain : "" + remain;
	return min + "m" + remainStr + "s";
}

/* -------------------------------------------------------------------------- */
/* kliq:ai-action-busy 自定义事件 (§57-2 增强)                                 */
/* -------------------------------------------------------------------------- */

/** 事件名常量 — 跟 AIEnhancePanel.tsx 与 AIToolbar.tsx 共用 */
export const AI_ACTION_BUSY_EVENT = "kliq:ai-action-busy" as const;

/** payload: 告诉监听者谁在跑什么 AI 任务 */
export type AIActionBusyDetail = {
	readonly action: AIAction;
	readonly busy: boolean;
	/** 派发方 source — 监听端用 source 区分避免自循环 */
	readonly source: "ai-enhance-panel" | "ai-toolbar" | "external";
	/** 可选: 预估剩余 ms (busy=true 时), UI 渲染倒计时 */
	readonly estimatedRemainMs?: number;
};

/** TypeScript 类型守卫 — AIEnhancePanel useEffect handler 收 event 用 */
export function isAIActionBusyDetail(value: unknown): value is AIActionBusyDetail {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	if (typeof v.action !== "string") return false;
	if (typeof v.busy !== "boolean") return false;
	if (v.source !== "ai-enhance-panel" && v.source !== "ai-toolbar" && v.source !== "external")
		return false;
	return true;
}

/** 派发 helper — window.CustomEvent 封装, source 透传 */
export function dispatchAIActionBusy(detail: AIActionBusyDetail): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent<AIActionBusyDetail>(AI_ACTION_BUSY_EVENT, { detail }));
}

/** 默认 estimated ms — 用于 AIEnhancePanel 自身不知道剩余时间时的兜底 */
export const DEFAULT_ACTION_REMAIN_MS = 30_000 as const;

/* -------------------------------------------------------------------------- */
/* §61 AI Action 呈现层 (合并 AIToolbar.tsx 的 AI_ACTION_PRESENTATION)         */
/* -------------------------------------------------------------------------- */

import type { Icon } from "@phosphor-icons/react";
import {
	Article,
	Binoculars,
	CheckCircle,
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
import {
	AI_ACTION_IDS,
	AI_ACTION_SPECS,
	type AIActionGroup,
	type AIInput,
} from "@/lib/ai/action-inputs";

/** 动作的呈现信息。与逻辑契约（AI_ACTION_SPECS）分成两张表，各自由 Record 强制完整。 */
type AIActionPresentation = {
	labelKey: string;
	labelFallback: string;
	/** 专业线性图标（项目规范：界面不得使用 emoji 当图标） */
	Icon: Icon;
};

export const AI_ACTION_PRESENTATION: Record<AIAction, AIActionPresentation> = {
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

/** UI 渲染顺序 — 与 trash/AIToolbar.tsx 完全一致 */
export const GROUP_ORDER: AIActionGroup[] = [
	"transcribe",
	"edit",
	"generate",
	"translate",
	"search",
];

/** 按组 + order 分组后的动作（用于 AIEnhancePanel 渲染按钮群） */
export function groupActionsByOrder(): {
	group: AIActionGroup;
	actions: AIActionDef[];
}[] {
	return GROUP_ORDER.map((group) => ({
		group,
		actions: AI_ACTIONS.filter((action) => action.group === group),
	})).filter((entry) => entry.actions.length > 0);
}

/** 9 个热词域 — 与 hotwords.ts 的 HotwordDomain 对齐, AIEnhancePanel dropdown 用 */
export const HOTWORD_DOMAINS = [
	"general",
	"legal",
	"medical",
	"ecommerce",
	"education",
	"finance",
	"gaming",
	"tech",
	"marketing",
] as const satisfies readonly import("@/lib/hotwords").HotwordDomain[];
