/**
 * Kliq — AI 动作输入契约的回归测试
 *
 * 这组测试针对的是一个已经真实发生过的缺陷：
 *
 *   16 个 AI 动作里，9 个（章节/摘要/标题/标签/社媒文案/多语言字幕/字幕校对/
 *   语义搜索/文案润色）需要 transcript / segments / query / sourceText，
 *   而唯一的调用方对所有动作一律只传 `{ file }` —— 点下去必然抛错。
 *
 * 「动作实现是否存在」这类审计完全看不出这个问题（实现都在、单测也过），
 * 所以这里用**穷举 + 契约断言**把它钉死：任何动作只要声明了 needs，
 * 组装出的 params 就必须覆盖那些 needs。以后新加动作若忘了接线，这里直接红。
 */

import { describe, expect, it } from "vitest";
import {
	AI_ACTION_IDS,
	AI_ACTION_SPECS,
	AI_INPUTS,
	AI_INPUT_TO_PARAM_KEY,
	type AIAction,
	type AIInputState,
	buildAIActionParams,
	DEFAULT_TRANSLATE_TARGETS,
	EMPTY_AI_INPUTS,
	isAIActionReady,
	missingAIInputs,
} from "./action-inputs";

/** 所有输入都就绪 */
const FULL_STATE: AIInputState = {
	hasFile: true,
	hasDuration: true,
	transcript: "这是一段转录文本",
	segmentCount: 12,
	query: "讲了什么坑",
	sourceText: "一段待润色的文案",
};

/** 只有文件选中（这正是修复前的调用方所能提供的全部） */
const FILE_ONLY_STATE: AIInputState = {
	...EMPTY_AI_INPUTS,
	hasFile: true,
};

const FULL_CONTEXT = {
	file: new Blob(["x"]),
	transcript: FULL_STATE.transcript,
	durationSec: 123.4,
	segments: [{ id: 1, start: 0, end: 1.5, text: "hello" }],
	query: FULL_STATE.query,
	sourceText: FULL_STATE.sourceText,
};

describe("AI_ACTION_SPECS", () => {
	it("覆盖全部 16 个动作，且每个动作都声明了输入需求", () => {
		expect(AI_ACTION_IDS).toHaveLength(16);
		for (const action of AI_ACTION_IDS) {
			expect(AI_ACTION_SPECS[action].needs.length).toBeGreaterThan(0);
		}
	});

	it("needs 里只出现受支持的输入项", () => {
		for (const action of AI_ACTION_IDS) {
			for (const need of AI_ACTION_SPECS[action].needs) {
				expect(AI_INPUTS).toContain(need);
			}
		}
	});

	it("每个 needs 项都有对应的 params 键映射", () => {
		for (const input of AI_INPUTS) {
			expect(typeof AI_INPUT_TO_PARAM_KEY[input]).toBe("string");
			expect(AI_INPUT_TO_PARAM_KEY[input].length).toBeGreaterThan(0);
		}
	});
});

describe("buildAIActionParams 覆盖 needs（核心契约）", () => {
	it("穷举所有动作：命中的 params 必须覆盖它声明的全部 needs", () => {
		const failures: string[] = [];
		for (const action of AI_ACTION_IDS) {
			const params = buildAIActionParams(action, FULL_CONTEXT);
			for (const need of AI_ACTION_SPECS[action].needs) {
				const key = AI_INPUT_TO_PARAM_KEY[need];
				if (!(key in params)) {
					failures.push(`${action} 需要 ${need}（params 键 ${key}）但未提供`);
					continue;
				}
				// 值必须真的可用，不能是 undefined / 空
				const value = params[key];
				if (value === undefined) {
					failures.push(`${action} 的 ${key} 为 undefined`);
				}
			}
		}
		expect(failures).toEqual([]);
	});

	it("需要文件的动作会带上 file", () => {
		for (const action of AI_ACTION_IDS) {
			if (!AI_ACTION_SPECS[action].needs.includes("file")) continue;
			expect(buildAIActionParams(action, FULL_CONTEXT)).toHaveProperty("file");
		}
	});

	it("章节同时带 transcript 与 durationSec，且时长为秒", () => {
		const params = buildAIActionParams("ai-chapters", FULL_CONTEXT);
		expect(params.transcript).toBe(FULL_CONTEXT.transcript);
		expect(params.durationSec).toBe(123.4);
	});

	it("多语言字幕带上非空的默认目标语言", () => {
		const params = buildAIActionParams("ai-translate-multi", FULL_CONTEXT);
		expect(params.segments).toBe(FULL_CONTEXT.segments);
		expect(params.targets).toEqual(DEFAULT_TRANSLATE_TARGETS);
		expect((params.targets as string[]).length).toBeGreaterThan(0);
	});

	it("只给 file 的上下文里，文本类动作拿到的是**空**输入（即曾经的 bug 现场）", () => {
		const context = {
			...FULL_CONTEXT,
			transcript: "",
			durationSec: null,
			segments: [],
			query: "",
			sourceText: "",
		};
		expect(buildAIActionParams("ai-summary", context).transcript).toBe("");
		expect(buildAIActionParams("ai-chapters", context).durationSec).toBeUndefined();
		expect(buildAIActionParams("ai-proofread", context).segments).toEqual([]);
		expect(buildAIActionParams("ai-semantic-search", context).query).toBe("");
		expect(buildAIActionParams("ai-ui-polish", context).sourceText).toBe("");
	});
});

describe("missingAIInputs / isAIActionReady", () => {
	it("输入全空时，缺的就是该动作声明的全部 needs", () => {
		for (const action of AI_ACTION_IDS) {
			expect(missingAIInputs(action, EMPTY_AI_INPUTS)).toEqual(AI_ACTION_SPECS[action].needs);
			expect(isAIActionReady(action, EMPTY_AI_INPUTS)).toBe(false);
		}
	});

	it("输入全就绪时，没有任何动作缺输入", () => {
		for (const action of AI_ACTION_IDS) {
			expect(missingAIInputs(action, FULL_STATE)).toEqual([]);
			expect(isAIActionReady(action, FULL_STATE)).toBe(true);
		}
	});

	/**
	 * 这条就是修复前线上真实的样子：选中文件后，只有 7 个动作能用，
	 * 另外 9 个点下去必然抛错。固化下来，避免再次回归。
	 */
	it("回归防护：只选文件时，恰有 7 个动作就绪、9 个不可用", () => {
		const ready = AI_ACTION_IDS.filter((action) => isAIActionReady(action, FILE_ONLY_STATE));
		const blocked = AI_ACTION_IDS.filter((action) => !isAIActionReady(action, FILE_ONLY_STATE));

		expect(ready).toEqual([
			"transcribe",
			"bilingual-captions",
			"ai-silence",
			"ai-fillers",
			"ai-speed",
			"ai-zoom",
			"ai-oneclick",
		]);
		expect(blocked).toHaveLength(9);
		expect(blocked).toEqual(
			expect.arrayContaining([
				"ai-chapters",
				"ai-summary",
				"ai-titles",
				"ai-tags",
				"ai-social",
				"ai-translate-multi",
				"ai-proofread",
				"ai-semantic-search",
				"ai-ui-polish",
			]),
		);
	});

	it("纯空白字符串不算已填写", () => {
		const state: AIInputState = { ...FULL_STATE, transcript: "   \n\t " };
		expect(missingAIInputs("ai-summary", state)).toEqual(["transcript"]);
	});

	it("转录出字幕条数后，segments 类动作才就绪", () => {
		const before = { ...EMPTY_AI_INPUTS, hasFile: true };
		expect(missingAIInputs("ai-proofread", before)).toEqual(["segments"]);
		const after = { ...before, segmentCount: 3 };
		expect(missingAIInputs("ai-proofread", after)).toEqual([]);
	});

	it("已知媒体时长后，章节动作只差 transcript", () => {
		const state: AIInputState = { ...EMPTY_AI_INPUTS, hasFile: true, hasDuration: true };
		expect(missingAIInputs("ai-chapters", state)).toEqual(["transcript"]);
	});
});

describe("AIInput 类型完整性", () => {
	it("AI_INPUTS 覆盖全部 6 种输入", () => {
		expect([...AI_INPUTS].sort()).toEqual(
			["duration", "file", "query", "segments", "sourceText", "transcript"].sort(),
		);
	});

	it("每个动作的 needs 无重复项", () => {
		for (const action of AI_ACTION_IDS) {
			const needs = AI_ACTION_SPECS[action].needs;
			expect(new Set(needs).size).toBe(needs.length);
		}
	});

	it("动作 id 无拼写重复", () => {
		expect(new Set<AIAction>(AI_ACTION_IDS).size).toBe(AI_ACTION_IDS.length);
	});
});
