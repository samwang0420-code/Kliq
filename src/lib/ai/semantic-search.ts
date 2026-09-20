/**
 * Kliq — AI 语义搜索 (P1/D1)
 *
 * 基于 transcript 文本做 embedding + 相似度检索
 * 让用户输入自然语言查询 (如"讲了什么坑"), 找到视频中相关的时间段
 *
 * 实现: 调用 OpenAI text-embedding-3-small + 余弦相似度
 *       本地存储最近 50 个 transcript 的 embeddings (localStorage)
 */

import type { TranscribeSegment } from "./openai-client";
import { chatCompletion } from "./openai-client";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;
const STORAGE_KEY = "yanjing.semantic.embeddings.v1";
const MAX_CACHED_TRANSCRIPTS = 50;

export type IndexedTranscript = {
	transcriptId: string;
	videoTitle: string;
	segments: Array<{
		id: string;
		startMs: number;
		endMs: number;
		text: string;
		embedding: number[];
	}>;
	indexedAt: number;
};

export type SearchHit = {
	transcriptId: string;
	videoTitle: string;
	startMs: number;
	endMs: number;
	text: string;
	score: number;
	highlights: string[];
};

export type SearchOptions = {
	query: string;
	transcripts?: IndexedTranscript[];
	/** 返回 top-k 默认 5 */
	topK?: number;
	/** 最低分数阈值 (0-1) */
	minScore?: number;
};

/** 给一段文本生成 embedding */
async function embed(text: string, apiKey: string, baseUrl: string): Promise<number[]> {
	const url = `${baseUrl}/embeddings`;
	const res = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: EMBEDDING_MODEL,
			input: text.slice(0, 8000), // embedding 限 token
		}),
	});
	if (!res.ok) {
		throw new Error(`Embedding API error: ${res.status} ${res.statusText}`);
	}
	const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
	return json.data[0]?.embedding ?? [];
}

/** 余弦相似度 */
function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length) return 0;
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom === 0 ? 0 : dot / denom;
}

/**
 * 给一个 transcript 建立索引 (生成 embedding, 存 localStorage)
 *
 * @param transcriptId 视频 ID
 * @param videoTitle 视频标题
 * @param segments Whisper segments
 */
export async function indexTranscript(
	transcriptId: string,
	videoTitle: string,
	segments: Pick<TranscribeSegment, "id" | "start" | "end" | "text">[],
): Promise<IndexedTranscript> {
	// 语义搜索依赖 OpenAI 的 embeddings 端点（DeepSeek 没有 embeddings API），
	// 所以这里固定读 openai 凭据，不走文本后端偏好。
	const entry = await import("../apiKeys").then((m) => m.getApiKey("openai"));
	if (!entry) {
		throw new Error(
			"语义搜索需要 OpenAI API key（embeddings 端点）。请到「个人中心 → AI 服务」配置。",
		);
	}

	// 并发生成 embedding
	const indexed = await Promise.all(
		segments.map(async (s) => ({
			id: String(s.id),
			startMs: Math.round((s.start ?? 0) * 1000),
			endMs: Math.round((s.end ?? 0) * 1000),
			text: s.text ?? "",
			embedding: await embed(
				s.text ?? "",
				entry.apiKey,
				entry.baseUrl ?? "https://api.openai.com/v1",
			),
		})),
	);

	const result: IndexedTranscript = {
		transcriptId,
		videoTitle,
		segments: indexed,
		indexedAt: Date.now(),
	};

	saveToCache(result);
	return result;
}

/** 语义搜索 */
export async function semanticSearch(options: SearchOptions): Promise<SearchHit[]> {
	const entry = await import("../apiKeys").then((m) => m.getApiKey("openai"));
	if (!entry) {
		throw new Error(
			"语义搜索需要 OpenAI API key（embeddings 端点）。请到「个人中心 → AI 服务」配置。",
		);
	}

	const transcripts = options.transcripts ?? loadFromCache();
	const topK = options.topK ?? 5;
	const minScore = options.minScore ?? 0.5;

	const queryEmbedding = await embed(
		options.query,
		entry.apiKey,
		entry.baseUrl ?? "https://api.openai.com/v1",
	);

	const hits: SearchHit[] = [];
	for (const t of transcripts) {
		for (const seg of t.segments) {
			const score = cosineSimilarity(queryEmbedding, seg.embedding);
			if (score >= minScore) {
				hits.push({
					transcriptId: t.transcriptId,
					videoTitle: t.videoTitle,
					startMs: seg.startMs,
					endMs: seg.endMs,
					text: seg.text,
					score,
					highlights: extractHighlights(options.query, seg.text),
				});
			}
		}
	}

	hits.sort((a, b) => b.score - a.score);
	return hits.slice(0, topK);
}

/** 提取 query 与 text 共有词作为高亮 */
function extractHighlights(query: string, text: string): string[] {
	const queryTokens = new Set(
		query
			.toLowerCase()
			.split(/[\s,，。.!?！？、]+/)
			.filter((t) => t.length >= 2),
	);
	const matches: string[] = [];
	for (const token of queryTokens) {
		if (text.toLowerCase().includes(token)) {
			matches.push(token);
		}
	}
	return matches;
}

// ===== 本地缓存 =====

function saveToCache(transcript: IndexedTranscript) {
	if (typeof localStorage === "undefined") return;
	try {
		const all = loadFromCache();
		// 去重 + 保留最近 50 个
		const filtered = all.filter((t) => t.transcriptId !== transcript.transcriptId);
		filtered.unshift(transcript);
		const trimmed = filtered.slice(0, MAX_CACHED_TRANSCRIPTS);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
	} catch (err) {
		console.warn("[semantic-search] saveToCache failed:", err);
	}
}

function loadFromCache(): IndexedTranscript[] {
	if (typeof localStorage === "undefined") return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		return JSON.parse(raw) as IndexedTranscript[];
	} catch {
		return [];
	}
}

/** 清空缓存 */
export function clearSemanticCache(): void {
	if (typeof localStorage === "undefined") return;
	localStorage.removeItem(STORAGE_KEY);
}

/** 用 GPT-4 把自然语言查询转成更好的搜索 query (可选优化) */
export async function expandQuery(query: string): Promise<string> {
	try {
		const expanded = await chatCompletion({
			messages: [
				{
					role: "system",
					content:
						"你是搜索查询优化助手。给定用户查询, 返回 3-5 个同义词/相关词, 用空格分隔。仅返回结果, 不要解释。",
				},
				{ role: "user", content: query },
			],
			temperature: 0.5,
			maxTokens: 80,
		});
		return `${query} ${expanded}`;
	} catch {
		return query;
	}
}

export const SEMANTIC_SEARCH_CONFIG = {
	EMBEDDING_MODEL,
	EMBEDDING_DIM,
	STORAGE_KEY,
	MAX_CACHED_TRANSCRIPTS,
} as const;
