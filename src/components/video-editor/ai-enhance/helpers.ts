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
