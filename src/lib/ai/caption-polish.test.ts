/**
 * §51 Kliq — caption-polish.ts 端到端测试
 *
 * 覆盖: translateToMultipleLanguages 并发、proofreadCaptions JSON 解析 + 错误处理
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
	SUPPORTED_LANGUAGES,
	translateToMultipleLanguages,
	proofreadCaptions,
} from "./caption-polish";
import {
	setupElectronApi,
	mockFetchJson,
	getFetchMock,
} from "./_test-helper";

beforeEach(() => {
	setupElectronApi({ openaiKey: "sk-test", chatProvider: "openai" });
});

const SAMPLE_SEGMENTS = [
	{ id: 1, start: 0, end: 1.5, text: "hello" },
	{ id: 2, start: 1.5, end: 3.2, text: "world" },
];

describe("SUPPORTED_LANGUAGES", () => {
	it("7 种目标语言", () => {
		expect(SUPPORTED_LANGUAGES).toHaveLength(7);
		expect(SUPPORTED_LANGUAGES.map((l) => l.code)).toEqual([
			"zh",
			"en",
			"ja",
			"ko",
			"fr",
			"es",
			"de",
		]);
	});
});

describe("translateToMultipleLanguages", () => {
	it("并发翻译 → Record<TargetLanguage, TranscribeSegment[]>", async () => {
		// 第 1 个调用返 zh, 第 2 个返 en
		mockFetchJson({
			choices: [
				{
					message: {
						content: JSON.stringify([
							{ id: 1, start: 0, end: 1.5, text: "你好" },
							{ id: 2, start: 1.5, end: 3.2, text: "世界" },
						]),
					},
				},
			],
		});
		const result = await translateToMultipleLanguages(SAMPLE_SEGMENTS, ["zh"]);
		expect(result.zh).toHaveLength(2);
		expect(result.zh[0].text).toBe("你好");
		expect(getFetchMock()).toHaveBeenCalledTimes(1);
	});

	it("空 segments → 直接返空 Record, 不调 fetch", async () => {
		const fn = mockFetchJson({ choices: [{ message: { content: "[]" } }] });
		const result = await translateToMultipleLanguages([], ["zh"]);
		expect(result.zh).toEqual([]);
		expect(fn).not.toHaveBeenCalled();
	});
});

describe("proofreadCaptions", () => {
	it("happy path: 解析 issues + correctedCaptions JSON", async () => {
		mockFetchJson({
			choices: [
				{
					message: {
						content: JSON.stringify({
							issues: [
								{
									id: 1,
									originalText: "hello",
									suggestedText: "Hello",
									issueType: "punctuation",
									severity: "low",
									reason: "首字母大写",
								},
							],
							correctedCaptions: [
								{ id: 1, start: 0, end: 1.5, text: "Hello" },
								{ id: 2, start: 1.5, end: 3.2, text: "world" },
							],
						}),
					},
				},
			],
		});
		const result = await proofreadCaptions({ captions: SAMPLE_SEGMENTS });
		expect(result.totalIssues).toBe(1);
		expect(result.highSeverityCount).toBe(0);
		expect(result.issues[0].suggestedText).toBe("Hello");
		expect(result.issues[0].captionId).toBe("1");
		expect(result.correctedCaptions[0].text).toBe("Hello");
		expect(result.correctedCaptions[1].text).toBe("world");
	});

	it("空 captions → 返空结果, 不调 API", async () => {
		const fn = mockFetchJson({});
		const result = await proofreadCaptions({ captions: [] });
		expect(result.issues).toEqual([]);
		expect(result.correctedCaptions).toEqual([]);
		expect(fn).not.toHaveBeenCalled();
	});
});
