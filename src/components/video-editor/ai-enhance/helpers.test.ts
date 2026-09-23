/**
 * Kliq — AI 增强 helpers 单元测试 (§57-2)
 *
 * 覆盖 mapping function + 格式化 + 防御 typo.
 * 不需要 DOM (env=node).
 */

import { describe, expect, it } from "vitest";
import { getScenarioTemplate, SCENARIO_TEMPLATES } from "@/lib/presets";
import {
	ACTION_LABEL_ZH,
	FEATURE_LABEL_TO_ACTION,
	formatElapsed,
	formatRemain,
	resolveScenarioActions,
	shortLabelForAction,
} from "./helpers";

describe("AI enhance helpers (§57-2)", () => {
	it("FEATURE_LABEL_TO_ACTION covers all canonical Chinese labels", () => {
		// 已知 canonical label 必须有映射
		expect(FEATURE_LABEL_TO_ACTION["AI 去静音"]).toBe("ai-silence");
		expect(FEATURE_LABEL_TO_ACTION["AI 去填充词"]).toBe("ai-fillers");
		expect(FEATURE_LABEL_TO_ACTION["AI 智能加速"]).toBe("ai-speed");
		expect(FEATURE_LABEL_TO_ACTION["AI 自动取景"]).toBe("ai-zoom");
		expect(FEATURE_LABEL_TO_ACTION["AI 一键剪辑"]).toBe("ai-oneclick");
		expect(FEATURE_LABEL_TO_ACTION["AI 章节"]).toBe("ai-chapters");
		expect(FEATURE_LABEL_TO_ACTION["AI 摘要"]).toBe("ai-summary");
		expect(FEATURE_LABEL_TO_ACTION["AI 标题"]).toBe("ai-titles");
		expect(FEATURE_LABEL_TO_ACTION["AI 标题备选"]).toBe("ai-titles");
		expect(FEATURE_LABEL_TO_ACTION["AI 标签"]).toBe("ai-tags");
		expect(FEATURE_LABEL_TO_ACTION["AI 字幕"]).toBe("bilingual-captions");
		expect(FEATURE_LABEL_TO_ACTION["AI 双向字幕"]).toBe("bilingual-captions");
		expect(FEATURE_LABEL_TO_ACTION["AI 校对"]).toBe("ai-proofread");
		expect(FEATURE_LABEL_TO_ACTION["AI 多语言字幕"]).toBe("ai-translate-multi");
		expect(FEATURE_LABEL_TO_ACTION["AI 社媒文案"]).toBe("ai-social");
	});

	it("resolveScenarioActions: liveStream", () => {
		const actions = resolveScenarioActions(SCENARIO_TEMPLATES.liveStream);
		// liveStream.features = ["AI 去静音", "AI 章节", "AI 标题备选", "AI 标签"]
		expect(actions).toEqual(["ai-silence", "ai-chapters", "ai-titles", "ai-tags"]);
	});

	it("resolveScenarioActions: teaching", () => {
		const actions = resolveScenarioActions(SCENARIO_TEMPLATES.teaching);
		// teaching.features = ["AI 章节", "AI 摘要", "AI 标题", "AI 标签", "AI 字幕"]
		expect(actions).toEqual([
			"ai-chapters",
			"ai-summary",
			"ai-titles",
			"ai-tags",
			"bilingual-captions",
		]);
	});

	it("resolveScenarioActions: dedup (defensive)", () => {
		// 假设 features 含重复 label, 应去重保留首次出现
		const fakeTemplate = {
			...SCENARIO_TEMPLATES.liveStream,
			features: ["AI 去静音", "AI 去静音", "AI 章节"],
		};
		const actions = resolveScenarioActions(fakeTemplate);
		expect(actions).toEqual(["ai-silence", "ai-chapters"]);
	});

	it("resolveScenarioActions: silently drops unknown labels", () => {
		const fakeTemplate = {
			...SCENARIO_TEMPLATES.liveStream,
			features: ["AI 去静音", "Magic 按钮", "AI 章节"],
		};
		const actions = resolveScenarioActions(fakeTemplate);
		expect(actions).toEqual(["ai-silence", "ai-chapters"]);
	});

	it("resolveScenarioActions: empty features yields empty array", () => {
		const fakeTemplate = { ...SCENARIO_TEMPLATES.liveStream, features: [] };
		expect(resolveScenarioActions(fakeTemplate)).toEqual([]);
	});

	it("shortLabelForAction: all 16 AIAction have a Chinese label", () => {
		const allActions = Object.keys(ACTION_LABEL_ZH) as Array<keyof typeof ACTION_LABEL_ZH>;
		expect(allActions.length).toBe(16);
		for (const action of allActions) {
			const label = shortLabelForAction(action);
			expect(label).toBeTruthy();
			expect(label).toMatch(/^[\u4e00-\u9fa5a-zA-Z\s]+$/);
		}
	});

	it("shortLabelForAction: transcribe maps to Whisper 转录", () => {
		expect(shortLabelForAction("transcribe")).toBe("Whisper 转录");
	});

	it("formatElapsed: <1s boundary", () => {
		expect(formatElapsed(0)).toBe("0s");
		expect(formatElapsed(500)).toBe("0.5s");
		expect(formatElapsed(999)).toBe("0.9s");
	});

	it("formatElapsed: seconds", () => {
		expect(formatElapsed(1000)).toBe("1s");
		expect(formatElapsed(12_000)).toBe("12s");
		expect(formatElapsed(59_000)).toBe("59s");
	});

	it("formatElapsed: minutes (zero-pad)", () => {
		expect(formatElapsed(60_000)).toBe("1m00s");
		expect(formatElapsed(83_000)).toBe("1m23s");
		expect(formatElapsed(2 * 60_000 + 5_000)).toBe("2m05s");
	});

	it("formatRemain: 0 means done", () => {
		expect(formatRemain(0)).toBe("完成");
		expect(formatRemain(-100)).toBe("完成");
	});

	it("formatRemain: sec / min", () => {
		expect(formatRemain(5_000)).toBe("5s");
		expect(formatRemain(60_000)).toBe("1m00s");
		expect(formatRemain(75_000)).toBe("1m15s");
	});

	it("getScenarioTemplate: returns same value as SCENARIO_TEMPLATES access", () => {
		expect(getScenarioTemplate("liveStream")).toBe(SCENARIO_TEMPLATES.liveStream);
		expect(getScenarioTemplate("teaching").id).toBe("teaching");
	});
});
