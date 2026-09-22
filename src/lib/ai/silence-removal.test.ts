/**
 * §51 Kliq — silence-removal.ts 端到端测试
 *
 * 注意：silence-removal 不是基于 raw samples 检测, 而是基于 Whisper 转录结果的
 * segments gaps。这意味着测试必须 mock transcribeWithWhisper 的响应, 而不能直接传 Float32Array。
 */
import { describe, expect, it, beforeEach } from "vitest";
import { detectSilenceRegions, silenceRegionsToSrt } from "./silence-removal";
import { setupElectronApi, mockFetchJson, getFetchMock } from "./_test-helper";

beforeEach(() => {
	setupElectronApi({ openaiKey: "sk-test", chatProvider: "openai" });
});

/** mock Whisper verbose_json 响应 */
function mockWhisperResponse(segments: Array<{ id: number; start: number; end: number; text: string }>, duration?: number) {
	mockFetchJson({
		text: segments.map((s) => s.text).join(" "),
		language: "zh",
		duration,
		segments,
	});
}

describe("detectSilenceRegions", () => {
	it("空 segments → silenceRegions 空", async () => {
		mockWhisperResponse([], 0);
		const result = await detectSilenceRegions({
			audioFile: new Blob(["x"]),
			videoDurationMs: 5000,
		});
		expect(result.silenceRegions).toEqual([]);
		expect(result.totalSilenceMs).toBe(0);
		expect(result.savingsPercent).toBe(0);
	});

	it("segments 间 gap > 1500ms → 标记为静音", async () => {
		mockWhisperResponse(
			[
				{ id: 1, start: 0, end: 1.0, text: "你好" },
				{ id: 2, start: 3.0, end: 4.0, text: "世界" },
			],
			10,
		);
		const result = await detectSilenceRegions({
			audioFile: new Blob(["x"]),
		});
		expect(result.silenceRegions.length).toBeGreaterThanOrEqual(1);
		// 1.0s - 3.0s gap = 2000ms > threshold
		const gap = result.silenceRegions.find(
			(r) => r.startMs >= 1000 && r.endMs <= 3500,
		);
		expect(gap).toBeTruthy();
		expect(gap?.durationMs).toBe(2000);
	});

	it("segments 紧贴 (gap < 1500ms) → 无静音区间", async () => {
		mockWhisperResponse(
			[
				{ id: 1, start: 0, end: 1.0, text: "a" },
				{ id: 2, start: 1.5, end: 2.5, text: "b" },
			],
			3,
		);
		const result = await detectSilenceRegions({
			audioFile: new Blob(["x"]),
		});
		// segments 间 gap 500ms < 1500ms
		expect(result.silenceRegions.length).toBe(0);
	});

	it("开头静音 → 1 个 region 从 0 开始", async () => {
		mockWhisperResponse([{ id: 1, start: 2.0, end: 3.0, text: "x" }], 5);
		const result = await detectSilenceRegions({
			audioFile: new Blob(["x"]),
		});
		expect(result.silenceRegions[0].startMs).toBe(0);
		expect(result.silenceRegions[0].endMs).toBe(2000);
	});

	it("调用 Whisper 走 OpenAI URL", async () => {
		mockWhisperResponse([{ id: 1, start: 0, end: 1, text: "x" }], 1);
		await detectSilenceRegions({ audioFile: new Blob(["x"]) });
		const call = getFetchMock().mock.calls[0] as [string, RequestInit];
		expect(call[0]).toBe("https://api.openai.com/v1/audio/transcriptions");
	});
});

describe("silenceRegionsToSrt", () => {
	it("返 SRT 格式时间戳", () => {
		const regions = [
			{ id: "s1", startMs: 0, endMs: 1500, durationMs: 1500, startSec: 0, endSec: 1.5 },
			{ id: "s2", startMs: 5000, endMs: 7250, durationMs: 2250, startSec: 5, endSec: 7.25 },
		];
		const srt = silenceRegionsToSrt(regions);
		expect(srt).toContain("00:00:00,000 --> 00:00:01,500");
		expect(srt).toContain("00:00:05,000 --> 00:00:07,250");
	});

	it("空 regions → 空字符串", () => {
		expect(silenceRegionsToSrt([])).toBe("");
	});
});
