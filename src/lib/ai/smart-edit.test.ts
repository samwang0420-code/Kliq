/**
 * §51 Kliq — smart-edit.ts 端到端测试
 *
 * 覆盖: detectSpeedRegions / detectZoomRegions / oneClickEdit
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
	detectSpeedRegions,
	detectZoomRegions,
	oneClickEdit,
	speedRegionsToSrt,
	zoomRegionsToSrt,
} from "./smart-edit";
import { setupElectronApi, mockFetchJson, mockFetchSequence } from "./_test-helper";

beforeEach(() => {
	setupElectronApi({ openaiKey: "sk-test", chatProvider: "openai" });
});

function mockWhisperThenGpt(
	segments: Array<{ id: number; start: number; end: number; text: string }>,
	gptResponse: unknown,
) {
	mockFetchSequence([
		{
			text: segments.map((s) => s.text).join(" "),
			language: "zh",
			duration: segments[segments.length - 1]?.end ?? 0,
			segments,
		},
		{
			choices: [{ message: { content: JSON.stringify(gptResponse) } }],
		},
	]);
}

describe("detectSpeedRegions", () => {
	it("happy path: GPT 返 speed 数组 → SpeedRegion[]", async () => {
		mockWhisperThenGpt(
			[
				{ id: 1, start: 0, end: 1, text: "你好" },
				{ id: 2, start: 5, end: 8, text: "稍等,我在找文件" },
				{ id: 3, start: 8, end: 10, text: "找到了" },
			],
			[
				{ start: 5, end: 8, speed: 2.0, reason: "用户说'稍等'" },
			],
		);
		const result = await detectSpeedRegions({ audioFile: new Blob(["x"]) });
		expect(result).toHaveLength(1);
		expect(result[0].speed).toBe(2.0);
		expect(result[0].startMs).toBe(5000);
		expect(result[0].endMs).toBe(8000);
	});

	it("Whisper 返空 segments → 空 regions", async () => {
		mockFetchSequence([{ text: "", language: "zh", segments: [] }]);
		const result = await detectSpeedRegions({ audioFile: new Blob(["x"]) });
		expect(result).toEqual([]);
	});

	it("GPT JSON 解析失败 → 空数组 (fallback)", async () => {
		mockFetchSequence([
			{
				text: "x",
				language: "zh",
				segments: [{ id: 1, start: 0, end: 1, text: "x" }],
			},
			{ choices: [{ message: { content: "不是 JSON" } }] },
		]);
		const result = await detectSpeedRegions({ audioFile: new Blob(["x"]) });
		expect(result).toEqual([]);
	});
});

describe("detectZoomRegions", () => {
	it("happy path: GPT 返 zoom 数组 → ZoomRegion[]", async () => {
		mockWhisperThenGpt(
			[
				{ id: 1, start: 0, end: 5, text: "讲解背景" },
				{ id: 2, start: 5, end: 7, text: "点这里" },
			],
			[{ index: 1, reason: "重点内容" }],
		);
		const result = await detectZoomRegions({ audioFile: new Blob(["x"]) });
		expect(result).toHaveLength(1);
		expect(result[0].zoomLevel).toBe(1.5);
	});
});

describe("oneClickEdit", () => {
	it("组合 silence + filler + speed + zoom (mock 6 次 fetch)", async () => {
		const segments = [
			{ id: 1, start: 0, end: 1, text: "你好" },
			{ id: 2, start: 1, end: 2, text: "嗯" },
			{ id: 3, start: 2, end: 4, text: "世界" },
			{ id: 4, start: 6, end: 8, text: "稍等" },
			{ id: 5, start: 8, end: 10, text: "继续" },
		];
		mockFetchSequence([
			// 1) oneClickEdit 自己调 Whisper
			{ text: "x", language: "zh", segments },
			// 2) detectSilenceRegions 调 Whisper
			{ text: "x", language: "zh", segments },
			// 3) detectFillerRegions 调 Whisper
			{ text: "x", language: "zh", segments },
			// 4) detectSpeedRegions 调 Whisper
			{ text: "x", language: "zh", segments },
			// 5) detectSpeedRegions 调 GPT
			{ choices: [{ message: { content: JSON.stringify([{ start: 6, end: 8, speed: 2.0, reason: "稍等" }]) } }] },
			// 6) detectZoomRegions 调 Whisper
			{ text: "x", language: "zh", segments },
			// 7) detectZoomRegions 调 GPT (空)
			{ choices: [{ message: { content: "[]" } }] },
		]);
		const result = await oneClickEdit({ audioFile: new Blob(["x"]) });
		expect(result.silenceCount).toBe(1);
		expect(result.fillerCount).toBeGreaterThanOrEqual(1);
		expect(result.speedRegions).toHaveLength(1);
	});
});

describe("speedRegionsToSrt / zoomRegionsToSrt", () => {
	it("speed → SRT 格式", () => {
		const regions = [
			{
				id: "s1",
				startMs: 1000,
				endMs: 2000,
				durationMs: 1000,
				speed: 2.0,
				reason: "稍等",
			},
		];
		const srt = speedRegionsToSrt(regions);
		expect(srt).toContain("00:00:01,000 --> 00:00:02,000");
		expect(srt).toContain("2x");
	});

	it("zoom → SRT 格式", () => {
		const regions = [
			{
				id: "z1",
				startMs: 0,
				endMs: 1500,
				durationMs: 1500,
				zoomLevel: 1.5,
				reason: "重点",
			},
		];
		const srt = zoomRegionsToSrt(regions);
		expect(srt).toContain("1.5x");
	});
});
