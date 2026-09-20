/**
 * Kliq — AI 内容生成
 *
 * 提供:
 * - generateChapters(transcript) → 自动识别视频章节
 * - generateSummary(transcript) → 30 秒摘要 + 3 段亮点
 * - generateTitle(transcript) → 5 个候选标题
 * - generateTags(transcript) → 10 个 SEO 标签
 * - generateSocialCopy(transcript, platform) → 4 平台社媒文案
 *
 * 全部走 OpenAI GPT-4 / GPT-4o-mini (openai-client.ts)
 */

import { chatCompletion } from "./openai-client";
import { suggestDomain } from "../hotwords";
import type { HotwordDomain } from "../hotwords";

export type Chapter = {
	id: number;
	start: number;
	end: number;
	title: string;
};

export type Summary = {
	brief: string;
	highlights: string[];
	timestamp: number;
};

export type TitleCandidate = {
	title: string;
	style: "neutral" | "clickbait" | "professional";
};

export type SocialCopy = {
	twitter: string;
	xiaohongshu: string;
	wechat: string;
	bilibili: string;
};

/**
 * 生成视频章节
 */
export async function generateChapters(
	transcript: string,
	videoDuration: number,
): Promise<Chapter[]> {
	// 章节时间轴与 Whisper segment 同单位（秒）。此前调用方传的是毫秒，
	// 且在缺时长时直接走到下面的 toFixed 抛 TypeError（无法阅读的报错）。
	// 这里显式校验，把问题变成可执行的提示。
	if (!Number.isFinite(videoDuration) || videoDuration <= 0) {
		throw new Error("章节生成需要视频时长（秒），请先完成 AI 转录或选择媒体文件");
	}
	const domain = suggestDomain(transcript);
	const content = await chatCompletion({
		hotwordDomain: domain,
		messages: [
			{
				role: "system",
				content: `你是一位视频内容编辑。请根据以下转录文本,识别出 3-7 个视频章节。

输出严格 JSON 数组格式 (不要加任何解释):
[
  {"id": 1, "start": 0.0, "end": 30.5, "title": "章节标题"},
  {"id": 2, "start": 30.5, "end": 60.2, "title": "章节标题"}
]

要求:
1. start 必须是上一段 end (无缝衔接)
2. 第一段 start 必须为 0
3. 最后一段 end 必须为 ${videoDuration.toFixed(1)}
4. 章节标题简洁 (≤ 15 字)`,
			},
			{
				role: "user",
				content: transcript,
			},
		],
		temperature: 0.4,
		maxTokens: 1500,
	});

	return parseChapters(content);
}

function parseChapters(content: string): Chapter[] {
	try {
		const jsonMatch = content.match(/\[[\s\S]*\]/);
		if (jsonMatch) {
			return JSON.parse(jsonMatch[0]);
		}
	} catch {
		// Model may not return a JSON array; fall through to the empty result.
	}
	return [];
}

/**
 * 生成 30 秒摘要 + 3 段亮点
 */
export async function generateSummary(transcript: string): Promise<Summary> {
	const domain = suggestDomain(transcript);
	const content = await chatCompletion({
		hotwordDomain: domain,
		messages: [
			{
				role: "system",
				content: `你是一位视频内容编辑。请根据以下转录文本,生成一份摘要。

输出严格 JSON 格式 (不要加任何解释):
{
  "brief": "30 秒可读完的简短摘要 (≤ 200 字)",
  "highlights": ["亮点1 (≤ 50 字)", "亮点2", "亮点3"]
}

要求:
1. brief 用第三人称, 不要用"本视频"开头
2. highlights 用动词开头, 3 条
3. 总字数 ≤ 350 字`,
			},
			{
				role: "user",
				content: transcript,
			},
		],
		temperature: 0.5,
		maxTokens: 800,
	});

	try {
		const jsonMatch = content.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			const parsed = JSON.parse(jsonMatch[0]);
			return {
				brief: parsed.brief ?? "",
				highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
				timestamp: Date.now(),
			};
		}
	} catch {
		// Model may not return a JSON object; fall through to the empty summary.
	}

	return { brief: "", highlights: [], timestamp: Date.now() };
}

/**
 * 生成 5 个候选标题
 */
export async function generateTitles(transcript: string): Promise<TitleCandidate[]> {
	const domain = suggestDomain(transcript);
	const content = await chatCompletion({
		hotwordDomain: domain,
		messages: [
			{
				role: "system",
				content: `你是一位视频标题专家。请根据以下转录文本,生成 5 个候选标题。

输出严格 JSON 数组格式:
[
  {"title": "...", "style": "neutral"},
  {"title": "...", "style": "clickbait"},
  {"title": "...", "style": "professional"},
  {"title": "...", "style": "neutral"},
  {"title": "...", "style": "clickbait"}
]

要求:
1. 标题长度 ≤ 30 字
2. 不要使用 emoji
3. style 三种风格各占一定比例`,
			},
			{
				role: "user",
				content: transcript,
			},
		],
		temperature: 0.8,
		maxTokens: 600,
	});

	try {
		const jsonMatch = content.match(/\[[\s\S]*\]/);
		if (jsonMatch) {
			return JSON.parse(jsonMatch[0]);
		}
	} catch {
		// Model may not return a JSON array; fall through to the empty list.
	}

	return [];
}

/**
 * 生成 10 个 SEO 标签
 */
export async function generateTags(transcript: string): Promise<string[]> {
	const domain: HotwordDomain = suggestDomain(transcript);
	const content = await chatCompletion({
		hotwordDomain: domain,
		messages: [
			{
				role: "system",
				content: `你是一位 SEO 专家。请根据以下转录文本,生成 10 个高搜索量标签。

输出严格 JSON 数组格式 (不要加任何解释):
["标签1", "标签2", "标签3", ..., "标签10"]

要求:
1. 标签长度 2-6 字
2. 中文优先, 必要时中英混合
3. 不要带 # 号`,
			},
			{
				role: "user",
				content: transcript,
			},
		],
		temperature: 0.6,
		maxTokens: 300,
	});

	try {
		const jsonMatch = content.match(/\[[\s\S]*\]/);
		if (jsonMatch) {
			const tags = JSON.parse(jsonMatch[0]);
			if (Array.isArray(tags)) {
				return tags
					.map((t: unknown) => String(t).replace(/^#/, ""))
					.filter((t: string) => t.length > 0)
					.slice(0, 10);
			}
		}
	} catch {
		// Model may not return a valid JSON array; fall through to the empty list.
	}

	return [];
}

/**
 * 生成 4 平台社媒文案
 */
export async function generateSocialCopy(transcript: string): Promise<SocialCopy> {
	const domain = suggestDomain(transcript);
	const content = await chatCompletion({
		hotwordDomain: domain,
		messages: [
			{
				role: "system",
				content: `你是一位社媒运营专家。请根据以下转录文本,生成 4 个平台的文案。

输出严格 JSON 格式:
{
  "twitter": "≤ 280 字符,带 1-2 个 hashtag",
  "xiaohongshu": "≤ 200 字,带 5 个 hashtag,emoji 适量",
  "wechat": "≤ 100 字,正式语气,公众号风格",
  "bilibili": "≤ 150 字,B 站风格,可带 tag"
}

要求:
1. 每个平台风格不同
2. 不要复制摘要原话
3. 引发点击欲望`,
			},
			{
				role: "user",
				content: transcript,
			},
		],
		temperature: 0.8,
		maxTokens: 1500,
	});

	try {
		const jsonMatch = content.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			return JSON.parse(jsonMatch[0]);
		}
	} catch {
		// Model may not return a JSON object; fall through to the empty copy.
	}

	return { twitter: "", xiaohongshu: "", wechat: "", bilibili: "" };
}
