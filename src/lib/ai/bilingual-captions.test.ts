/**
 * §51 Kliq — bilingual-captions.ts 端到端测试
 *
 * generateBilingualCaptions 走两段 pipeline: Whisper 转录 → GPT 翻译。
 * 测试同时 mock 两段 fetch 调用。
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
	generateBilingualCaptions,
	captionsToSrt,
	captionsToVtt,
	type BilingualCaption,
} from "./bilingual-captions";
import { setupElectronApi, mockFetchJson, mockFetchSequence, getFetchMock } from "./_test-helper";

beforeEach(() => {
	setupElectronApi({ openaiKey: "sk-test", chatProvider: "openai" });
});

describe("generateBilingualCaptions", () => {
	it("happy path: Whisper + GPT 翻译 → sourceText + targetText", async () => {
		mockFetchSequence([
			// 第 1 次: Whisper verbose_json
			{
				text: "hello world",
				language: "en",
				segments: [
					{ id: 1, start: 0, end: 1.5, text: "hello" },
					{ id: 2, start: 1.5, end: 3.2, text: "world" },
				],
			},
			// 第 2 次: GPT 翻译
			{
				choices: [{
					message: {
						content: JSON.stringify([
							{ id: 1, start: 0, end: 1.5, text: "你好" },
							{ id: 2, start: 1.5, end: 3.2, text: "世界" },
						]),
					},
				}],
			},
		]);

		const result = await generateBilingualCaptions(new Blob(["x"]), { targetLanguage: "zh" });
		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({ sourceText: "hello", targetText: "你好" });
		expect(result[1]).toMatchObject({ sourceText: "world", targetText: "世界" });
		expect(getFetchMock()).toHaveBeenCalledTimes(2);
	});

	it("Whisper 返空 segments → 空数组, 不调 GPT", async () => {
		mockFetchJson({ text: "", language: "en", segments: [] });
		const result = await generateBilingualCaptions(new Blob(["x"]), { targetLanguage: "zh" });
		expect(result).toEqual([]);
	});
});

describe("captionsToSrt", () => {
	it("返 SRT 格式: 序号 + 时间戳 + 双语原文+译文", () => {
		const captions: BilingualCaption[] = [
			{ id: 1, start: 0, end: 1.5, sourceText: "hello", targetText: "你好" },
		];
		const srt = captionsToSrt(captions);
		expect(srt).toContain("1\n");
		expect(srt).toContain("00:00:00,000 --> 00:00:01,500");
		expect(srt).toContain("hello");
		expect(srt).toContain("你好");
	});

	it("空数组 → 空字符串", () => {
		expect(captionsToSrt([])).toBe("");
	});
});

describe("captionsToVtt", () => {
	it("返 WebVTT 格式: WEBVTT 头 + 时间戳", () => {
		const captions: BilingualCaption[] = [
			{ id: 1, start: 0, end: 1.5, sourceText: "hello", targetText: "你好" },
		];
		const vtt = captionsToVtt(captions);
		expect(vtt).toMatch(/^WEBVTT/);
		expect(vtt).toContain("00:00:00.000 --> 00:00:01.500");
	});
});
