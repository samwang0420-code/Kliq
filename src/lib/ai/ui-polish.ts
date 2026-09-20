/**
 * Kliq — UI 文案 AI 润色 (P1/G4)
 *
 * 调用 GPT-4 自动优化 UI 文案:
 * - 翻译为其他语言
 * - 缩短冗长文案
 * - 让语气更友好/专业
 */

import { chatCompletion } from "./openai-client";

export type PolishOptions = {
	/** 原始文案 (key=value 多行, 或单段) */
	sourceText: string;
	/** 目标语言 ("en" | "ja" | "ko" | "zh-CN" | "zh-TW"), 默认 en */
	targetLanguage?: string;
	/** 优化方向 */
	style?: "concise" | "friendly" | "professional" | "marketing";
	/** 单条 vs 多条 (key=value) */
	mode?: "single" | "batch";
};

export type PolishResult = {
	polishedText: string;
	originalText: string;
	changes: Array<{
		key?: string;
		from: string;
		to: string;
	}>;
};

/** 单条润色 */
export async function polishUIText(options: PolishOptions): Promise<PolishResult> {
	const { sourceText, targetLanguage = "en", style = "concise" } = options;

	const styleHint = {
		concise: "简洁有力, 不超过原文 80% 长度",
		friendly: "友好亲切, 像朋友对话",
		professional: "专业严谨, 适合 B 端",
		marketing: "营销风格, 引导点击",
	}[style];

	const prompt = `你是 UI 文案专家。给定一段 UI 文案 (${sourceText.length} 字符), 翻译并润色为 ${targetLanguage}。

要求:
1. ${styleHint}
2. 保留 UI 元素的语义 (按钮 = 动作, 标签 = 名词)
3. 不要添加额外解释或编号
4. 仅返回最终文案, 不要 Markdown 代码块

原文:
${sourceText}`;

	const polished = await chatCompletion({
		messages: [
			{ role: "system", content: "你是 UI 文案润色专家, 仅返回最终文案。" },
			{ role: "user", content: prompt },
		],
		temperature: 0.4,
		maxTokens: 800,
	});

	return {
		polishedText: polished.trim(),
		originalText: sourceText,
		changes: [{ from: sourceText, to: polished.trim() }],
	};
}

/** 批量润色 (key=value 格式, 每行一个) */
export async function polishUITextBatch(options: PolishOptions): Promise<PolishResult> {
	const { sourceText, targetLanguage = "en", style = "concise" } = options;

	const lines = sourceText.split("\n").filter((l) => l.includes("="));
	if (lines.length === 0) {
		return polishUIText(options);
	}

	const styleHint = {
		concise: "简洁有力",
		friendly: "友好亲切",
		professional: "专业严谨",
		marketing: "营销风格",
	}[style];

	const prompt = `你是 UI 文案专家。给定 ${lines.length} 条 i18n key=value 文本, 翻译并润色为 ${targetLanguage}。

要求:
1. ${styleHint}, 不超过原文 80% 长度
2. 保留 key 不变
3. 每行一条: key=value
4. 不要 Markdown 代码块

原文:
${sourceText}`;

	const response = await chatCompletion({
		messages: [
			{ role: "system", content: "你是 UI 文案润色专家, 返回 key=value 列表。" },
			{ role: "user", content: prompt },
		],
		temperature: 0.4,
		maxTokens: 1500,
	});

	const polishedLines = response.trim().split("\n");
	const changes: PolishResult["changes"] = [];
	for (let i = 0; i < lines.length; i++) {
		const orig = lines[i].split("=").slice(1).join("=").trim();
		const polished = polishedLines[i]?.split("=").slice(1).join("=").trim() ?? orig;
		const key = lines[i].split("=")[0]?.trim();
		changes.push({ key, from: orig, to: polished });
	}

	return {
		polishedText: polishedLines.join("\n"),
		originalText: sourceText,
		changes,
	};
}
