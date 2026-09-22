/**
 * §51 Kliq — semantic-search.ts 端到端测试
 *
 * 覆盖: indexTranscript (embedding 缓存) + semanticSearch (cosine 排序) + expandQuery
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
	indexTranscript,
	semanticSearch,
	expandQuery,
	clearSemanticCache,
	cosineSimilarity,
} from "./semantic-search";
import { setupElectronApi, mockFetchJson, getFetchMock } from "./_test-helper";

beforeEach(() => {
	setupElectronApi({ openaiKey: "sk-test", chatProvider: "openai" });
	// mock localStorage (Node 环境没有)
	const store: Record<string, string> = {};
	const lsm = {
		getItem: (k: string) => store[k] ?? null,
		setItem: (k: string, v: string) => { store[k] = v; },
		removeItem: (k: string) => { delete store[k]; },
		clear: () => { for (const k in store) delete store[k]; },
		key: (i: number) => Object.keys(store)[i] ?? null,
		get length() { return Object.keys(store).length; },
	};
	vi.stubGlobal("localStorage", lsm);
});

afterEach(() => {
	vi.unstubAllGlobals();
	clearSemanticCache();
});

describe("cosineSimilarity", () => {
	it("相同向量 → 1.0", () => {
		expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
	});
	it("正交向量 → 0", () => {
		expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
	});
	it("反向向量 → -1", () => {
		expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
	});
});

describe("indexTranscript", () => {
	it("happy path: 调 embeddings + 写 localStorage", async () => {
		mockFetchJson({ data: [{ embedding: [0.1, 0.2, 0.3] }] });
		const result = await indexTranscript("vid1", "Test Video", [
			{ id: 1, start: 0, end: 1, text: "你好" },
		]);
		expect(result.transcriptId).toBe("vid1");
		expect(result.videoTitle).toBe("Test Video");
		expect(result.segments).toHaveLength(1);
		expect(result.segments[0].embedding).toEqual([0.1, 0.2, 0.3]);
		// embedding URL 应是 OpenAI
		const call = getFetchMock().mock.calls[0] as [string, RequestInit];
		expect(call[0]).toBe("https://api.openai.com/v1/embeddings");
	});
});

describe("semanticSearch", () => {
	it("返回 top-k 按 cosine 排序", async () => {
		// §51 fix: 用不同 embedding 才能验证排序 — vid1=[1,0,0] 与 query 完全匹配,
		// vid2=[0,1,0] 正交得分 0, 应该排在 vid1 后面
		mockFetchJson({ data: [{ embedding: [1, 0, 0] }] });
		await indexTranscript("vid1", "相似", [{ id: 1, start: 0, end: 1, text: "hello" }]);
		mockFetchJson({ data: [{ embedding: [0, 1, 0] }] });
		await indexTranscript("vid2", "不相似", [{ id: 1, start: 0, end: 1, text: "world" }]);

		// 查询用 [1,0,0] → 跟 vid1 完全相似, 跟 vid2 正交
		mockFetchJson({ data: [{ embedding: [1, 0, 0] }] });
		const hits = await semanticSearch({ query: "测试" });
		expect(hits.length).toBeGreaterThanOrEqual(1);
		expect(hits[0].transcriptId).toBe("vid1");
		expect(hits[0].score).toBeCloseTo(1.0);
	});

	it("未配置 OpenAI key → 返空数组", async () => {
		setupElectronApi({ openaiKey: null });
		const hits = await semanticSearch({ query: "test" });
		expect(hits).toEqual([]);
	});
});

describe("expandQuery", () => {
	it("调用 chatCompletion 扩写查询", async () => {
		mockFetchJson({ choices: [{ message: { content: "搜索 同义词" } }] });
		const expanded = await expandQuery("搜索");
		expect(expanded).toContain("搜索");
		expect(expanded).toContain("同义词");
	});
});
