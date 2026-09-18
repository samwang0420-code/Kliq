/**
 * 言镜 — AI 去填充词 (P0/A2)
 *
 * 调用 OpenAI Whisper 转录音频 → 检测 "um/uh/那个/然后/比如" 等中英文填充词
 * → 输出 filler regions (用户可一键应用为静音覆盖或删除)
 */

import { transcribeWithWhisper } from "./openai-client";
import type { HotwordDomain } from "../hotwords";

/** 中英文常见填充词列表 */
const FILLER_WORDS_EN = [
	"um",
	"uh",
	"uhh",
	"umm",
	"er",
	"ah",
	"eh",
	"like",
	"you know",
	"i mean",
	"kind of",
	"sort of",
	"basically",
	"actually",
	"literally",
];

/** 中文填充词 */
const FILLER_WORDS_ZH = [
	"那个",
	"那个那个",
	"然后",
	"然后呢",
	"就是说",
	"这个",
	"这个这个",
	"嗯",
	"呃",
	"啊",
	"哦",
	"唉",
	"其实",
	"基本上",
	"大概",
	"反正",
	"比如",
	"比如说",
];

export type FillerRegion = {
	id: string;
	startMs: number;
	endMs: number;
	durationMs: number;
	word: string;
	language: "zh" | "en" | "mixed";
};

export type DetectFillerOptions = {
	audioFile: File | Blob;
	/** Whisper 语言, 默认 zh (影响使用哪套填充词字典) */
	language?: "zh" | "en" | "auto";
	/** 自定义填充词 (覆盖默认值) */
	customFillers?: string[];
	/** 热词域 */
	hotwordDomain?: HotwordDomain;
};

export type DetectFillerResult = {
	totalFillers: number;
	totalFillerMs: number;
	fillerRegions: FillerRegion[];
	/** 字典中命中的词 (调试用) */
	matchedWords: string[];
};

/**
 * 检测音频中的填充词
 *
 * 算法:
 * 1. 调用 Whisper 转录,获取带 word-level timestamps 的 segments
 * 2. 对每个 word, 判断是否在 filler 字典
 * 3. 连续多个填充词合并为一个 region
 *
 * 注意: Whisper 默认 response_format=verbose_json 才有 word-level timestamps
 *       但 OpenAI API 当前对 whisper-1 不一定返 word 级别, 兜底走 segment 级别
 */
export async function detectFillerRegions(
	options: DetectFillerOptions,
): Promise<DetectFillerResult> {
	const language = options.language ?? "zh";

	const whisperResult = await transcribeWithWhisper({
		audioFile: options.audioFile,
		language: language === "auto" ? undefined : language,
		responseFormat: "verbose_json",
		hotwordDomain: options.hotwordDomain,
	});

	const segments = whisperResult.segments ?? [];
	const fillers = buildFillerSet(options.customFillers, language);

	const fillerRegions: FillerRegion[] = [];
	const matchedWords = new Set<string>();

	// 优先 word-level, fallback segment-level
	type WordLike = { word?: string; text?: string; start?: number; end?: number };
	const allWords: WordLike[] = [];

	for (const seg of segments) {
		const segWords = (seg as unknown as { words?: WordLike[] }).words;
		if (segWords && segWords.length > 0) {
			allWords.push(...segWords);
		} else {
			// segment-level fallback: 整段判断
			const segText = (seg.text ?? "").trim().toLowerCase().replace(/[，。！？、,.\!?]/g, "");
			if (segText && isFillerOnly(segText, fillers)) {
				fillerRegions.push({
					id: `filler-${Math.round((seg.start ?? 0) * 1000)}`,
					startMs: Math.round((seg.start ?? 0) * 1000),
					endMs: Math.round((seg.end ?? 0) * 1000),
					durationMs: Math.round(((seg.end ?? 0) - (seg.start ?? 0)) * 1000),
					word: segText,
					language: detectLang(segText),
				});
				matchedWords.add(segText);
			}
		}
	}

	// word-level 处理
	if (allWords.length > 0) {
		for (const w of allWords) {
			const text = (w.word ?? w.text ?? "").trim().toLowerCase().replace(/[，。！？、,.\!?]/g, "");
			if (!text) continue;
			if (fillers.has(text)) {
				fillerRegions.push({
					id: `filler-${Math.round((w.start ?? 0) * 1000)}`,
					startMs: Math.round((w.start ?? 0) * 1000),
					endMs: Math.round((w.end ?? 0) * 1000),
					durationMs: Math.round(((w.end ?? 0) - (w.start ?? 0)) * 1000),
					word: text,
					language: detectLang(text),
				});
				matchedWords.add(text);
			}
		}
	}

	const totalFillerMs = fillerRegions.reduce((sum, r) => sum + r.durationMs, 0);
	return {
		totalFillers: fillerRegions.length,
		totalFillerMs,
		fillerRegions,
		matchedWords: Array.from(matchedWords),
	};
}

function buildFillerSet(custom: string[] | undefined, language: string): Set<string> {
	const set = new Set<string>();
	if (custom && custom.length > 0) {
		for (const w of custom) set.add(w.toLowerCase().replace(/[，。！？、,.\!?]/g, ""));
		return set;
	}
	if (language === "en") {
		for (const w of FILLER_WORDS_EN) set.add(w.toLowerCase());
	} else if (language === "zh") {
		for (const w of FILLER_WORDS_ZH) set.add(w.toLowerCase());
	} else {
		// auto: 合并
		for (const w of FILLER_WORDS_EN) set.add(w.toLowerCase());
		for (const w of FILLER_WORDS_ZH) set.add(w.toLowerCase());
	}
	return set;
}

function isFillerOnly(text: string, fillers: Set<string>): boolean {
	// 整段只有填充词 → 视为填充段
	const tokens = text.split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return false;
	return tokens.every((t) => fillers.has(t.toLowerCase()));
}

function detectLang(text: string): "zh" | "en" | "mixed" {
	const hasZh = /[\u4e00-\u9fa5]/.test(text);
	const hasEn = /[a-zA-Z]/.test(text);
	if (hasZh && hasEn) return "mixed";
	if (hasZh) return "zh";
	return "en";
}

/**
 * 把 filler regions 转成 CSV (用户可导入剪辑软件)
 */
export function fillerRegionsToCsv(regions: FillerRegion[]): string {
	const header = "id,start_ms,end_ms,duration_ms,word,language\n";
	const rows = regions
		.map(
			(r) =>
				`${r.id},${r.startMs},${r.endMs},${r.durationMs},"${r.word}",${r.language}`,
		)
		.join("\n");
	return header + rows;
}
