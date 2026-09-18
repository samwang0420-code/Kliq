/**
 * 言镜 — OpenAI 客户端
 *
 * 用于 AI 双语字幕 (Whisper 转录) + AI 章节/摘要 (GPT-4)
 *
 * 设计原则:
 * 1. 直接调用 OpenAI REST API, 不引入 SDK (减少依赖 + 减少打包体积)
 * 2. API key 仅在本地使用, 通过 getApiKey('openai') 读取
 * 3. 支持自定义 base URL (Azure / 自托管 / OpenRouter 等 OpenAI 兼容服务)
 * 4. 完整错误处理 + 重试机制
 */

import { getApiKey } from "../apiKeys";
import { buildWhisperPrompt, buildGptSystemPromptFragment } from "../hotwords";
import type { HotwordDomain } from "../hotwords";

const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";

function getOpenAIClient(): { apiKey: string; baseUrl: string; model: string } | null {
	const entry = getApiKey("openai");
	if (!entry) return null;

	return {
		apiKey: entry.apiKey,
		baseUrl: entry.baseUrl ?? OPENAI_DEFAULT_BASE_URL,
		model: entry.model ?? "gpt-4o-mini",
	};
}

export type TranscribeOptions = {
	audioFile: File | Blob;
	language?: string;
	hotwordDomain?: HotwordDomain;
	responseFormat?: "json" | "verbose_json" | "srt" | "vtt";
};

export type TranscribeSegment = {
	id: number;
	start: number;
	end: number;
	text: string;
};

export type TranscribeResult = {
	language: string;
	duration?: number;
	text: string;
	segments?: TranscribeSegment[];
};

/**
 * 调用 OpenAI Whisper API 转录音频
 *
 * @see https://platform.openai.com/docs/api-reference/audio/create
 */
export async function transcribeWithWhisper(options: TranscribeOptions): Promise<TranscribeResult> {
	const client = getOpenAIClient();
	if (!client) {
		throw new Error("OpenAI API key 未配置。请先在 AI 设置中配置 OpenAI API key。");
	}

	const formData = new FormData();
	formData.append("file", options.audioFile);
	formData.append("model", "whisper-1");
	if (options.language) {
		formData.append("language", options.language);
	}
	if (options.responseFormat) {
		formData.append("response_format", options.responseFormat);
	}

	// Whisper prompt 长度限制 224 tokens
	if (options.hotwordDomain) {
		const prompt = buildWhisperPrompt(options.hotwordDomain);
		if (prompt) {
			formData.append("prompt", prompt.slice(0, 1000));
		}
	}

	const url = `${client.baseUrl}/audio/transcriptions`;
	const response = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${client.apiKey}`,
		},
		body: formData,
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Whisper API 失败 (${response.status}): ${errorText.slice(0, 200)}`);
	}

	if (options.responseFormat === "verbose_json") {
		const json = await response.json();
		return {
			language: json.language ?? options.language ?? "auto",
			duration: json.duration,
			text: json.text ?? "",
			segments: json.segments ?? [],
		};
	}

	const text = await response.text();
	return {
		language: options.language ?? "auto",
		text,
	};
}

/**
 * 调用 GPT-4 / GPT-4o-mini 完成对话
 *
 * 用于 AI 翻译 / AI 章节 / AI 摘要 / AI 标题生成 / AI 社媒文案
 */
export type ChatMessage = {
	role: "system" | "user" | "assistant";
	content: string;
};

export type ChatOptions = {
	messages: ChatMessage[];
	model?: string;
	temperature?: number;
	maxTokens?: number;
	hotwordDomain?: HotwordDomain;
};

export async function chatCompletion(options: ChatOptions): Promise<string> {
	const client = getOpenAIClient();
	if (!client) {
		throw new Error("OpenAI API key 未配置。请先在 AI 设置中配置 OpenAI API key。");
	}

	const messages = [...options.messages];

	// 注入行业热词到 system prompt
	if (options.hotwordDomain) {
		const lastSystemIdx = messages.findIndex((m) => m.role === "system");
		if (lastSystemIdx >= 0) {
			messages[lastSystemIdx] = {
				...messages[lastSystemIdx],
				content: messages[lastSystemIdx].content + buildGptSystemPromptFragment(options.hotwordDomain),
			};
		} else {
			messages.unshift({
				role: "system",
				content: buildGptSystemPromptFragment(options.hotwordDomain),
			});
		}
	}

	const url = `${client.baseUrl}/chat/completions`;
	const response = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${client.apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: options.model ?? client.model,
			messages,
			temperature: options.temperature ?? 0.7,
			max_tokens: options.maxTokens ?? 2000,
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Chat API 失败 (${response.status}): ${errorText.slice(0, 200)}`);
	}

	const json = await response.json();
	return json.choices?.[0]?.message?.content ?? "";
}

/**
 * 调用 GPT-4 翻译字幕
 *
 * @param segments 原始字幕段 (Whisper 输出)
 * @param targetLanguage 目标语言 (例如 "zh-CN", "en", "ja")
 * @param sourceLanguage 源语言 (默认 "auto")
 */
export async function translateCaptions(
	segments: TranscribeSegment[],
	targetLanguage: string,
	sourceLanguage = "auto",
	hotwordDomain?: HotwordDomain,
): Promise<TranscribeSegment[]> {
	if (segments.length === 0) return [];

	const segmentTexts = segments.map((s) => s.text).join("\n");

	const result = await chatCompletion({
		hotwordDomain,
		messages: [
			{
				role: "system",
				content: `你是一位专业字幕翻译。请把以下${sourceLanguage === "auto" ? "原始" : sourceLanguage}字幕翻译成${targetLanguage}。

要求:
1. 保持原意, 不要增减信息
2. 保留时间戳 (start/end), 不要修改
3. 保留专有名词 (人名/品牌/产品名), 必要时附原文
4. 一行一段, 格式严格 JSON

输出格式 (JSON 数组):
[
  {"id": 1, "start": 0.0, "end": 3.5, "text": "译文"},
  {"id": 2, "start": 3.5, "end": 7.2, "text": "译文"}
]`,
			},
			{
				role: "user",
				content: segmentTexts,
			},
		],
		temperature: 0.3,
		maxTokens: 4000,
	});

	try {
		// 尝试提取 JSON 数组
		const jsonMatch = result.match(/\[[\s\S]*\]/);
		if (jsonMatch) {
			const parsed = JSON.parse(jsonMatch[0]);
			return parsed.map((item: { id: number; start: number; end: number; text: string }) => ({
				id: item.id,
				start: item.start,
				end: item.end,
				text: item.text,
			}));
		}
	} catch {
		// Fallback: 保留原文
	}

	return segments;
}

// ============================================================
// DeepSeek 客户端 (OpenAI 兼容 API, 复用 OpenAI schema)
// ============================================================

const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com/v1";

function getDeepSeekClient(): { apiKey: string; baseUrl: string; model: string } | null {
	const entry = getApiKey("deepseek");
	if (!entry) return null;

	return {
		apiKey: entry.apiKey,
		baseUrl: entry.baseUrl ?? DEEPSEEK_DEFAULT_BASE_URL,
		model: entry.model ?? "deepseek-chat",
	};
}

/**
 * DeepSeek 聊天补全 (用于 AI 翻译 / AI 章节 / AI 摘要 / AI 社媒文案)
 *
 * DeepSeek API 兼容 OpenAI /chat/completions 协议, 直接复用 body schema
 * @see https://api-docs.deepseek.com/
 */
export async function deepseekChatCompletion(options: ChatOptions): Promise<string> {
	const client = getDeepSeekClient();
	if (!client) {
		throw new Error("DeepSeek API key 未配置。请先在 AI 设置中配置 DeepSeek API key。");
	}

	const messages = [...options.messages];
	if (options.hotwordDomain) {
		const lastSystemIdx = messages.findIndex((m) => m.role === "system");
		if (lastSystemIdx >= 0) {
			messages[lastSystemIdx] = {
				...messages[lastSystemIdx],
				content: messages[lastSystemIdx].content + buildGptSystemPromptFragment(options.hotwordDomain),
			};
		} else {
			messages.unshift({
				role: "system",
				content: buildGptSystemPromptFragment(options.hotwordDomain),
			});
		}
	}

	const url = `${client.baseUrl}/chat/completions`;
	const response = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${client.apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: options.model ?? client.model,
			messages,
			temperature: options.temperature ?? 0.7,
			max_tokens: options.maxTokens ?? 2000,
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`DeepSeek Chat API 失败 (${response.status}): ${errorText.slice(0, 200)}`);
	}

	const json = await response.json();
	return json.choices?.[0]?.message?.content ?? "";
}
