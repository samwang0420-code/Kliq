/**
 * 言镜 — AI Highlight Reels 单元测试
 *
 * 覆盖三大纯函数入口 (rankHighlights / computeVisualEnergy / computeAudioEnergy) + 1 个集成 (synthetic).
 * 不依赖浏览器 DOM (analyzeVideo 单独 E2E, §15 用户验收).
 */

import { describe, expect, it } from "vitest";
import { computeAudioEnergy, computeVisualEnergy, rankHighlights } from "./highlight-reels";

// Helper: build N identical frames or N varied frames
function solidFrame(value: number): Uint8ClampedArray {
	const arr = new Uint8ClampedArray(96 * 54 * 4);
	arr.fill(value);
	// Set alpha
	for (let i = 3; i < arr.length; i += 4) arr[i] = 255;
	return arr;
}

function variedFrame(seed: number): Uint8ClampedArray {
	const arr = new Uint8ClampedArray(96 * 54 * 4);
	for (let i = 0; i < arr.length; i += 4) {
		const v = (seed * 31 + (i / 4) * 7) % 256;
		arr[i] = v;
		arr[i + 1] = (v * 3) % 256;
		arr[i + 2] = (v * 7) % 256;
		arr[i + 3] = 255;
	}
	return arr;
}

describe("rankHighlights", () => {
	it("returns empty array for empty input", () => {
		expect(rankHighlights([], [])).toEqual([]);
	});

	it("returns single window for single peak", () => {
		const T = 100;
		const visual = new Array(T).fill(0);
		const audio = new Array(T).fill(0);
		// Inject single peak at t=50. 5-frame smoothing spreads to t=48..52; first wins.
		// Window centered around peak should still contain 50.
		audio[50] = 1;
		const hs = rankHighlights(visual, audio, { count: 5, minLen: 10, maxLen: 30 });
		expect(hs.length).toBe(1);
		expect(hs[0].peakTime).toBeGreaterThanOrEqual(48);
		expect(hs[0].peakTime).toBeLessThanOrEqual(52);
		expect(hs[0].start).toBeLessThanOrEqual(50);
		expect(hs[0].end).toBeGreaterThanOrEqual(50);
	});

	it("returns non-overlapping windows for K peaks", () => {
		const T = 200;
		const visual = new Array(T).fill(0);
		const audio = new Array(T).fill(0);
		// Three independent peaks (well separated)
		audio[20] = 1;
		audio[100] = 0.9;
		audio[180] = 0.8;
		const hs = rankHighlights(visual, audio, { count: 3, minLen: 5, maxLen: 15 });
		expect(hs.length).toBe(3);
		// Sorted by start
		expect(hs[0].start).toBeLessThan(hs[1].start);
		expect(hs[1].start).toBeLessThan(hs[2].start);
		// Non-overlapping
		expect(hs[0].end).toBeLessThanOrEqual(hs[1].start);
		expect(hs[1].end).toBeLessThanOrEqual(hs[2].start);
	});

	it("higher scores get longer windows", () => {
		const T = 200;
		// Two peaks: one at 50 (score=1), one at 150 (score=0.3)
		const visual = new Array(T).fill(0);
		const audio = new Array(T).fill(0);
		audio[50] = 1;
		audio[150] = 0.3;
		const hs = rankHighlights(visual, audio, { count: 2, minLen: 5, maxLen: 30 });
		const high = hs.find((h) => Math.abs(h.peakTime - 50) < 5)!;
		const low = hs.find((h) => Math.abs(h.peakTime - 150) < 5)!;
		expect(high.end - high.start).toBeGreaterThan(low.end - low.start);
	});

	it("stops at noise floor", () => {
		const T = 100;
		const visual = new Array(T).fill(0.001); // below 0.01 noise threshold
		const audio = new Array(T).fill(0.001);
		// audioFocus: 0 → combined = visual only (0.001 < 0.01). Otherwise
		// combined = 0.4*0.001 + 0.6*sqrt(0.001) ≈ 0.019, crossing the threshold.
		const hs = rankHighlights(visual, audio, { count: 5, audioFocus: 0 });
		expect(hs.length).toBe(0);
	});

	it("normalizes score to relative max", () => {
		const T = 100;
		const visual = new Array(T).fill(0);
		const audio = new Array(T).fill(0);
		audio[30] = 1;
		audio[70] = 0.5;
		const hs = rankHighlights(visual, audio, { count: 2, minLen: 5, maxLen: 15 });
		expect(hs[0].score).toBeGreaterThan(0.99); // top peak normalized to 1
		// Second peak score < 1
		const peak2 = hs.find((h) => Math.abs(h.peakTime - 70) < 5);
		expect(peak2).toBeDefined();
		expect(peak2!.score).toBeLessThan(1);
	});
});

describe("computeVisualEnergy", () => {
	it("returns empty for single frame", () => {
		expect(computeVisualEnergy([solidFrame(0)])).toEqual([]);
	});

	it("returns zero for identical frames", () => {
		const f = solidFrame(128);
		const e = computeVisualEnergy([f, f, f, f]);
		expect(e.every((v) => Math.abs(v) < 0.01)).toBe(true);
	});

	it("returns positive energy for differing frames", () => {
		const f1 = solidFrame(0);
		const f2 = solidFrame(255);
		const e = computeVisualEnergy([f1, f2]);
		expect(e[0]).toBeGreaterThan(0.5); // large jump → high energy
	});

	it("output length = input length - 1", () => {
		const N = 10;
		const frames = Array.from({ length: N }, (_, i) => variedFrame(i));
		const e = computeVisualEnergy(frames);
		expect(e.length).toBe(N - 1);
	});

	it("handles unequal length frames gracefully", () => {
		const f1 = solidFrame(0);
		const f2 = new Uint8ClampedArray(96 * 54 * 8); // different length
		const e = computeVisualEnergy([f1, f2]);
		expect(e.length).toBe(1);
		expect(e[0]).toBe(0); // falls back to 0 for size mismatch
	});
});

describe("computeAudioEnergy", () => {
	it("returns empty for empty samples", () => {
		expect(computeAudioEnergy([], 48000)).toEqual([]);
		expect(computeAudioEnergy([], 44100, 1)).toEqual([]);
	});

	it("returns zero energy for silence", () => {
		const samples = new Array(48000).fill(0); // 1s silence @ 48kHz
		const e = computeAudioEnergy(samples, 48000, 0.5);
		expect(e.every((v) => Math.abs(v) < 0.001)).toBe(true);
	});

	it("returns higher energy for louder signal", () => {
		// 1s @ 48kHz — alternating soft/loud
		const sr = 48000;
		const soft = new Array(sr)
			.fill(0)
			.map((_, i) => Math.sin((i / sr) * 2 * Math.PI * 440) * 0.05);
		const loud = new Array(sr)
			.fill(0)
			.map((_, i) => Math.sin((i / sr) * 2 * Math.PI * 440) * 0.95);
		const eSoft = computeAudioEnergy(soft, sr, 0.5);
		const eLoud = computeAudioEnergy(loud, sr, 0.5);
		expect(eLoud[0]).toBeGreaterThan(eSoft[0]);
	});

	it("window count matches expected", () => {
		const sr = 48000;
		const samples = new Array(sr * 3).fill(0); // 3s
		const e = computeAudioEnergy(samples, sr, 0.5);
		expect(e.length).toBe(6); // 3s / 0.5s = 6 windows
	});
});

describe("integration: synthetic ranking pipeline", () => {
	it("selects audio-peak moments over silent segments", () => {
		const T = 60; // 60 samples (1 minute @ 1Hz)
		const visual = new Array(T).fill(0);
		const audio = new Array(T).fill(0);

		// Background: low-energy ambient
		for (let i = 0; i < T; i++) audio[i] = 0.05;

		// Punch moment at t=15 (loud)
		for (let i = 12; i <= 18; i++) audio[i] = 0.9;

		const hs = rankHighlights(visual, audio, {
			count: 1,
			minLen: 5,
			maxLen: 15,
			audioFocus: 1, // audio-only
		});
		expect(hs.length).toBe(1);
		expect(hs[0].peakTime).toBeGreaterThanOrEqual(12);
		expect(hs[0].peakTime).toBeLessThanOrEqual(18);
	});

	it("rebalances to visual when audio is silent", () => {
		const T = 50;
		const visual = new Array(T).fill(0);
		const audio = new Array(T).fill(0);

		// Quiet audio, strong visual change at t=20
		visual[18] = 0.9;
		visual[19] = 0.9;
		visual[20] = 0.9;
		visual[21] = 0.9;
		visual[22] = 0.9;

		const hs = rankHighlights(visual, audio, {
			count: 1,
			minLen: 5,
			maxLen: 15,
			audioFocus: 0, // visual only
		});
		expect(hs.length).toBe(1);
		expect(hs[0].peakTime).toBeGreaterThanOrEqual(18);
		expect(hs[0].peakTime).toBeLessThanOrEqual(22);
	});
});
