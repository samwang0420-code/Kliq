/**
 * Kliq — 字幕 AI 校对 + 多语言翻译 (P1/B4+B5)
 *
 * B4: 扩展 translateCaptions 支持 7 种目标语言
 * B5: GPT-4 自动校对字幕错字/标点/语气词
 */

import { chatCompletion, translateCaptions, type TranscribeSegment } from "./openai-client";

export const SUPPORTED_LANGUAGES = [
	{ code: "zh", name: "中文 (简体)", flag: "🇨🇳" },
	{ code: "en", name: "English", flag: "🇺🇸" },
	{ code: "ja", name: "日本語", flag: "🇯🇵" },
	{ code: "ko", name: "한국어", flag: "🇰🇷" },
	{ code: "fr", name: "Français", flag: "🇫🇷" },
	{ code: "es", name: "Español", flag: "🇪🇸" },
	{ code: "de", name: "Deutsch", flag: "🇩🇪" },
] as const;

export type TargetLanguage = (typeof SUPPORTED_LANGUAGES)[number]["code"];

/** B4 多语言翻译 */
export async function translateToMultipleLanguages(
	segments: TranscribeSegment[],
	targets: TargetLanguage[],
	sourceLanguage = "auto",
): Promise<Record<TargetLanguage, TranscribeSegment[]>> {
	const result: Partial<Record<TargetLanguage, TranscribeSegment[]>> = {};
	await Promise.all(
		targets.map(async (lang) => {
			result[lang] = await translateCaptions(segments, lang, sourceLanguage);
		}),
	);
	return result as Record<TargetLanguage, TranscribeSegment[]>;
}

/** B5 GPT-4 字幕校对 */
export type ProofreadOptions = {
	captions: TranscribeSegment[];
	hotwordDomain?: string;
	strictness?: "low" | "medium" | "high";
};

export type ProofreadIssue = {
	captionId: string;
	originalText: string;
	suggestedText: string;
	issueType: "typo" | "punctuation" | "redundancy" | "fluency" | "factual";
	severity: "low" | "medium" | "high";
	reason: string;
};

export type ProofreadResult = {
	issues: ProofreadIssue[];
	correctedCaptions: TranscribeSegment[];
	totalIssues: number;
	highSeverityCount: number;
};

export async function proofreadCaptions(options: ProofreadOptions): Promise<ProofreadResult> {
	const { captions, hotwordDomain, strictness = "medium" } = options;
	if (captions.length === 0) {
		return { issues: [], correctedCaptions: [], totalIssues: 0, highSeverityCount: 0 };
	}

	const prompt = `你是字幕校对专家。给定一段带 ID 的字幕列表, 找出错误并给出修改建议。

错误类型:
- typo: 错别字
- punctuation: 标点错误
- redundancy: 冗余重复 (如"那个那个")
- fluency: 表达不流畅
- factual: 与上下文不符 (考虑${hotwordDomain ?? "通用"}领域专业术语)

严格度: ${strictness} (low = 只改 typo, medium = typo + punctuation, high = 全部)

只输出 JSON 数组, 每个元素含:
- id: 字幕 ID (字符串)
- originalText: 原文
- suggestedText: 建议修改 (如无需修改填原文)
- issueType: typo | punctuation | redundancy | fluency | factual
- severity: low | medium | high
- reason: 简短原因 (≤ 30 字)

字幕列表:
${captions.map((c) => `[${c.id}] ${c.start}-${c.end}s: "${c.text}" | "${c.text}"`).join("\n")}`;

	try {
		const response = await chatCompletion({
			messages: [
				{ role: "system", content: "你是字幕校对专家, 只输出 JSON 数组。" },
				{ role: "user", content: prompt },
			],
			temperature: 0.2,
			maxTokens: 2000,
		});

		const jsonMatch = response.match(/\[[\s\S]*\]/);
		if (!jsonMatch) {
			return {
				issues: [],
				correctedCaptions: captions,
				totalIssues: 0,
				highSeverityCount: 0,
			};
		}

		const parsed = JSON.parse(jsonMatch[0]) as Array<
			Omit<ProofreadIssue, "captionId"> & { id: string }
		>;
		const issues: ProofreadIssue[] = parsed.map((p) => ({
			captionId: String(p.id),
			originalText: p.originalText,
			suggestedText: p.suggestedText,
			issueType: p.issueType,
			severity: p.severity,
			reason: p.reason,
		}));

		const issueMap = new Map(issues.map((i) => [i.captionId, i]));
		const correctedCaptions: TranscribeSegment[] = captions.map((c) => {
			const issue = issueMap.get(String(c.id));
			if (!issue) return c;
			return { ...c, text: issue.suggestedText };
		});

		return {
			issues,
			correctedCaptions,
			totalIssues: issues.length,
			highSeverityCount: issues.filter((i) => i.severity === "high").length,
		};
	} catch (err) {
		console.warn("[caption-polish] GPT-4 proofread failed:", err);
		return { issues: [], correctedCaptions: captions, totalIssues: 0, highSeverityCount: 0 };
	}
}
