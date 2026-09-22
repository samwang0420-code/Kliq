/**
 * §51 Kliq — filler-removal.ts 端到端测试
 *
 * detectFillerRegions 走 Whisper verbose_json, 扫 segments 找纯填充词段。
 */
import { describe, expect, it, beforeEach } from "vitest";
import { detectFillerRegions, fillerRegionsToCsv } from "./filler-removal";
import { setupElectronApi, mockFetchJson } from "./_test-helper";

beforeEach(() => {
	setupElectronApi({ openaiKey: "sk-test", chatProvider: "openai" });
});

function mockWhisper(segments: Array<{ id: number; start: number; end: number; text: string }>) {
	mockFetchJson({
		text: segments.map((s) => s.text).join(" "),
		language: "zh",
		duration: segments[segments.length - 1]?.end ?? 0,
		segments,
	});
}

describe("detectFillerRegions", () => {
	it("纯填充词段 (整段仅'嗯') → 标记", async () => {
		mockWhisper([
			{ id: 1, start: 0, end: 1, text: "你好" },
			{ id: 2, start: 1, end: 2, text: "嗯" },
			{ id: 3, start: 2, end: 4, text: "世界" },
		]);
		const result = await detectFillerRegions({
			audioFile: new Blob(["x"]),
			language: "zh",
		});
		expect(result.fillerRegions.length).toBeGreaterThanOrEqual(1);
		expect(result.fillerRegions[0].word).toBe("嗯");
		expect(result.fillerRegions[0].startMs).toBe(1000);
		expect(result.fillerRegions[0].endMs).toBe(2000);
	});

	it("全有效内容 → 无填充", async () => {
		mockWhisper([
			{ id: 1, start: 0, end: 1, text: "你好" },
			{ id: 2, start: 1, end: 3, text: "今天天气不错" },
		]);
		const result = await detectFillerRegions({
			audioFile: new Blob(["x"]),
			language: "zh",
		});
		expect(result.fillerRegions.length).toBe(0);
	});

	it("英文 filler (uh/um) → 标记", async () => {
		mockWhisper([
			{ id: 1, start: 0, end: 1, text: "hello" },
			{ id: 2, start: 1, end: 1.5, text: "uh" },
			{ id: 3, start: 1.5, end: 3, text: "world" },
		]);
		const result = await detectFillerRegions({
			audioFile: new Blob(["x"]),
			language: "en",
		});
		expect(result.fillerRegions.length).toBeGreaterThanOrEqual(1);
	});
});

describe("fillerRegionsToCsv", () => {
	it("返 CSV 字符串", () => {
		const regions = [
			{
				id: "f1",
				startMs: 0,
				endMs: 1500,
				durationMs: 1500,
				word: "嗯",
				language: "zh",
			},
		];
		const csv = fillerRegionsToCsv(regions);
		expect(csv).toContain("id,start_ms,end_ms,duration_ms,word,language");
		expect(csv).toContain(`f1,0,1500,1500,"嗯",zh`);
	});

	it("空数组 → 表头", () => {
		const csv = fillerRegionsToCsv([]);
		expect(csv).toContain("id,start_ms,end_ms,duration_ms,word,language");
	});
});
