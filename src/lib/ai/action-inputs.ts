/**
 * Kliq — AI 动作的输入契约（纯逻辑，无 React / 无图标 / 无 i18n）
 *
 * 这个模块存在的**唯一理由**是一个反复出现的缺陷形状：
 *
 *   能力实现好了、也导出了、甚至测试也覆盖了，但**从来没接到 UI 上**。
 *
 * 具体到本项目：16 个 AI 动作里，有 9 个需要 transcript / segments / query /
 * sourceText 才能执行，而唯一的调用方（ExportSettingsMenu）对所有动作一律只传
 * `{ file }`。于是那 9 个按钮点下去必然抛错，付费用户在界面上永远走不通 ——
 * 而「动作是否存在」这类审计是**完全看不出问题**的（实现都在、测试也过）。
 *
 * 所以这里把「每个动作需要哪些输入」和「如何把输入组装成调用参数」抽成纯函数，
 * 由 `action-inputs.test.ts` 用穷举的方式钉住：
 *   - 每个动作都必须有 needs 声明（Record<AIAction, …> 由类型强制）
 *   - 每个动作组装出的 params 必须覆盖它声明的所有 needs
 * 这样「声明了却不接线」会在测试里直接失败，而不是等到用户点下去。
 */

import type { TranscribeSegment } from "./openai-client";
import type { TargetLanguage } from "./caption-polish";

/** 全部 AI 动作 id */
export type AIAction =
	| "transcribe" // B1 OpenAI Whisper 转录
	| "bilingual-captions" // B2 GPT-4 双语字幕
	| "ai-silence" // A1 去静音段
	| "ai-fillers" // A2 去填充词
	| "ai-speed" // A3 智能加速
	| "ai-zoom" // A4 自动取景
	| "ai-oneclick" // A5 一键剪辑
	| "ai-chapters" // C1 章节
	| "ai-summary" // C2 摘要
	| "ai-titles" // C3 标题
	| "ai-tags" // C4 标签
	| "ai-social" // C5 社媒文案
	| "ai-translate-multi" // B4 多语言字幕
	| "ai-proofread" // B5 字幕 AI 校对
	| "ai-semantic-search" // D1 语义搜索
	| "ai-ui-polish"; // G4 UI 润色

export type AIActionGroup = "transcribe" | "edit" | "generate" | "translate" | "search";

/**
 * 动作执行前必须就绪的输入 —— 这张表是**唯一真源**：
 *   - 工具栏据此判断按钮可用性并提示「还缺什么」
 *   - 调用方据此组装 runAction 的 params
 */
export type AIInput = "file" | "duration" | "transcript" | "segments" | "query" | "sourceText";

export const AI_INPUTS: readonly AIInput[] = [
	"file",
	"duration",
	"transcript",
	"segments",
	"query",
	"sourceText",
] as const;

export type AIActionSpec = {
	group: AIActionGroup;
	needs: AIInput[];
};

/**
 * 每个动作的输入需求。
 *
 * 类型是 `Record<AIAction, AIActionSpec>`：**少写一个动作就编译不过**，
 * 这是防止「新加动作忘了接线」的第一道闸门。
 */
export const AI_ACTION_SPECS: Record<AIAction, AIActionSpec> = {
	transcribe: { group: "transcribe", needs: ["file"] },
	"bilingual-captions": { group: "transcribe", needs: ["file"] },

	"ai-silence": { group: "edit", needs: ["file"] },
	"ai-fillers": { group: "edit", needs: ["file"] },
	"ai-speed": { group: "edit", needs: ["file"] },
	"ai-zoom": { group: "edit", needs: ["file"] },
	"ai-oneclick": { group: "edit", needs: ["file"] },

	// 章节的时间轴与 Whisper segment 同单位（秒），故同时需要 transcript 与 duration
	"ai-chapters": { group: "generate", needs: ["transcript", "duration"] },
	"ai-summary": { group: "generate", needs: ["transcript"] },
	"ai-titles": { group: "generate", needs: ["transcript"] },
	"ai-tags": { group: "generate", needs: ["transcript"] },
	"ai-social": { group: "generate", needs: ["transcript"] },

	// 校对与多语言翻译作用在**带时间轴的字幕**上，不能只给纯文本
	"ai-translate-multi": { group: "translate", needs: ["segments"] },
	"ai-proofread": { group: "translate", needs: ["segments"] },

	"ai-semantic-search": { group: "search", needs: ["query"] },
	"ai-ui-polish": { group: "search", needs: ["sourceText"] },
};

export const AI_ACTION_IDS = Object.keys(AI_ACTION_SPECS) as AIAction[];

/** 工具栏当前可用的输入快照 */
export type AIInputState = {
	hasFile: boolean;
	/** 是否已知媒体时长（章节生成需要，单位秒） */
	hasDuration: boolean;
	transcript: string;
	/** 已转写出的带时间轴字幕条数（多语言字幕 / 校对需要） */
	segmentCount: number;
	query: string;
	sourceText: string;
};

export const EMPTY_AI_INPUTS: AIInputState = {
	hasFile: false,
	hasDuration: false,
	transcript: "",
	segmentCount: 0,
	query: "",
	sourceText: "",
};

function isInputReady(input: AIInput, state: AIInputState): boolean {
	switch (input) {
		case "file":
			return state.hasFile;
		case "duration":
			return state.hasDuration;
		case "transcript":
			return state.transcript.trim().length > 0;
		case "segments":
			return state.segmentCount > 0;
		case "query":
			return state.query.trim().length > 0;
		case "sourceText":
			return state.sourceText.trim().length > 0;
		default:
			return false;
	}
}

/** 该动作还缺哪些输入（空数组 = 就绪，可以执行） */
export function missingAIInputs(action: AIAction, state: AIInputState): AIInput[] {
	return AI_ACTION_SPECS[action].needs.filter((input) => !isInputReady(input, state));
}

/** 动作是否已就绪 */
export function isAIActionReady(action: AIAction, state: AIInputState): boolean {
	return missingAIInputs(action, state).length === 0;
}

/** 「还缺什么」的文案兜底（i18n key：yanjing.ai.inputHints.<input>） */
export const AI_INPUT_HINT_FALLBACKS: Record<AIInput, string> = {
	file: "请先选择视频 / 音频文件",
	duration: "需要媒体时长（先选择文件）",
	transcript: "需要转录文本：先运行「AI 转录」或粘贴文本",
	segments: "需要带时间轴的字幕：先运行「AI 转录」",
	query: "需要填写搜索关键词",
	sourceText: "需要填写待润色文案",
};

/** 多语言字幕的默认目标语言（中文创作者的常见分发组合） */
export const DEFAULT_TRANSLATE_TARGETS: TargetLanguage[] = ["en", "ja", "ko"];

/** 组装 params 时可用的上下文 */
export type AIParamContext = {
	/** 选中的媒体文件（本地启发式动作使用） */
	file?: Blob;
	transcript: string;
	/** 媒体时长，单位**秒** */
	durationSec: number | null;
	segments: TranscribeSegment[];
	query: string;
	sourceText: string;
};

export const EMPTY_AI_PARAM_CONTEXT: AIParamContext = {
	transcript: "",
	durationSec: null,
	segments: [],
	query: "",
	sourceText: "",
};

/**
 * 把一个动作 + 输入上下文，组装成 `runAction` 需要的 params。
 *
 * 与 `AI_ACTION_SPECS` 共用同一份 needs 契约；`action-inputs.test.ts` 会穷举
 * 所有动作，断言「命中的 params 键覆盖了该动作声明的全部 needs」—— 于是
 * 「声明了 needs 却忘了在这里接线」会让测试直接失败。
 */
export function buildAIActionParams(
	action: AIAction,
	context: AIParamContext,
): Record<string, unknown> {
	switch (action) {
		case "ai-chapters":
			return {
				transcript: context.transcript,
				durationSec: context.durationSec ?? undefined,
			};
		case "ai-summary":
		case "ai-titles":
		case "ai-tags":
		case "ai-social":
			return { transcript: context.transcript };
		case "ai-translate-multi":
			return { segments: context.segments, targets: DEFAULT_TRANSLATE_TARGETS };
		case "ai-proofread":
			return { segments: context.segments };
		case "ai-semantic-search":
			return { query: context.query, segments: context.segments };
		case "ai-ui-polish":
			return { sourceText: context.sourceText, targetLanguage: "en", mode: "single" };
		default:
			// 其余动作都是本地启发式 / 音频直传，只需要文件
			return { file: context.file };
	}
}

/** needs 中的输入项 → 它对应的 params 键（用于测试与自检） */
export const AI_INPUT_TO_PARAM_KEY: Record<AIInput, string> = {
	file: "file",
	duration: "durationSec",
	transcript: "transcript",
	segments: "segments",
	query: "query",
	sourceText: "sourceText",
};
