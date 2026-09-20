/**
 * Kliq — 行业热词模块测试
 *
 * 重点防护两件事：
 *
 * 1. **prompt 绝不超出 Whisper 的 token 上限**。
 *    修复前调用方写的是 `prompt.slice(0, 1000)` —— 按字符截断，而限额单位是
 *    token；中文下 1000 字符 ≈ 1000 token，是 224 上限的 4 倍多，那层「保护」
 *    从未生效。实测 `general` 包拼出的 prompt 约 508 token，超限 2.3 倍。
 *
 * 2. **声明与实际一致**。词包里的 `word_count` 与真实词数曾经对不上，
 *    这里逐包校验，避免再次漂移。
 */

import { describe, expect, it } from "vitest";
import {
	buildGptSystemPromptFragment,
	buildWhisperPrompt,
	estimatePromptTokens,
	getHotwordPack,
	getHotwords,
	getWhisperPromptWords,
	listDomains,
	suggestDomain,
	WHISPER_PROMPT_TOKEN_BUDGET,
	type HotwordDomain,
} from "./hotwords";

const DOMAINS = listDomains();

/** 专业词包（不含默认的 general） */
const PROFESSIONAL_DOMAINS = DOMAINS.filter((d) => d !== "general");

describe("词包数据完整性", () => {
	it("9 个领域都有词包且非空", () => {
		expect(DOMAINS).toHaveLength(9);
		for (const domain of DOMAINS) {
			expect(getHotwords(domain).length).toBeGreaterThan(0);
		}
	});

	it("每个词包的 word_count 与真实词数一致", () => {
		const mismatches: string[] = [];
		for (const domain of DOMAINS) {
			const pack = getHotwordPack(domain);
			expect(pack).not.toBeNull();
			if (!pack) continue;
			if (pack.word_count !== pack.words.length) {
				mismatches.push(`${domain}: 声明 ${pack.word_count} / 实际 ${pack.words.length}`);
			}
		}
		expect(mismatches).toEqual([]);
	});

	it("每个词包内部没有重复词", () => {
		const dups: string[] = [];
		for (const domain of DOMAINS) {
			const words = getHotwords(domain);
			if (new Set(words).size !== words.length) dups.push(domain);
		}
		expect(dups).toEqual([]);
	});

	it("词条非空、无首尾空白", () => {
		const bad: string[] = [];
		for (const domain of DOMAINS) {
			for (const word of getHotwords(domain)) {
				if (!word || word !== word.trim()) bad.push(`${domain}:${word}`);
			}
		}
		expect(bad).toEqual([]);
	});

	it("8 个专业词包都已扩张到至少 80 词", () => {
		expect(PROFESSIONAL_DOMAINS).toHaveLength(8);
		const thin = PROFESSIONAL_DOMAINS.filter((d) => getHotwords(d).length < 80);
		expect(thin).toEqual([]);
	});
});

describe("Whisper prompt token 预算", () => {
	it("estimatePromptTokens：中日韩字符约 1 token/字", () => {
		expect(estimatePromptTokens("原告")).toBe(2);
		expect(estimatePromptTokens("")).toBe(0);
		// 全角标点也算 CJK 区
		expect(estimatePromptTokens("、")).toBe(1);
	});

	it("estimatePromptTokens：非中日韩字符约 4 字符/token（向上取整）", () => {
		expect(estimatePromptTokens("abcd")).toBe(1);
		expect(estimatePromptTokens("abcde")).toBe(2);
		expect(estimatePromptTokens("API")).toBe(1);
	});

	it("**所有领域**的 prompt 都不超过 224 token 硬上限", () => {
		const over: string[] = [];
		for (const domain of DOMAINS) {
			const prompt = buildWhisperPrompt(domain);
			const tokens = estimatePromptTokens(prompt);
			if (tokens > 224) over.push(`${domain}: ${tokens} tokens`);
		}
		expect(over).toEqual([]);
	});

	it("**所有领域**的 prompt 落在自设预算内（留有余量）", () => {
		for (const domain of DOMAINS) {
			const prompt = buildWhisperPrompt(domain);
			expect(estimatePromptTokens(prompt)).toBeLessThanOrEqual(WHISPER_PROMPT_TOKEN_BUDGET);
		}
	});

	/**
	 * 这条固化修复前的现场：general 包 154 个词拼出来约 508 token。
	 * 若哪天有人去掉预算逻辑，这里会立刻红。
	 */
	it("回归防护：general 词数 150+，但 prompt 仍在预算内", () => {
		expect(getHotwords("general").length).toBeGreaterThan(150);
		expect(estimatePromptTokens(buildWhisperPrompt("general"))).toBeLessThanOrEqual(
			WHISPER_PROMPT_TOKEN_BUDGET,
		);
	});

	it("预算内尽可能多装词（跳过装不下的，而不是就此中断）", () => {
		for (const domain of DOMAINS) {
			const picked = getWhisperPromptWords(domain);
			expect(picked.length).toBeGreaterThan(0);
			// 每个 80 词的包至少应装下 75%；实测最低为 legal / tech 的 62 词
			if (domain !== "general") {
				expect(picked.length).toBeGreaterThanOrEqual(60);
				expect(picked.length).toBeGreaterThanOrEqual(getHotwords(domain).length * 0.75);
			}
		}
	});

	/**
	 * 分隔符的选择直接决定能装多少词：顿号约 1 token/个，半角逗号约 0.25 token/个。
	 * 若有人把分隔符改回顿号，装词量会掉 20%+，这里会红。
	 */
	it("回归防护：单包的入选词数不低于 60，且用半角逗号分隔", () => {
		const thin = DOMAINS.filter(
			(domain) => domain !== "general" && getWhisperPromptWords(domain).length < 60,
		);
		expect(thin).toEqual([]);

		// 词表部分必须以半角逗号连接（前缀文案里自带顿号，所以只校验词表片段）
		const picked = getWhisperPromptWords("legal");
		expect(picked.join(",")).toContain(",");
		expect(buildWhisperPrompt("legal")).toContain(picked.join(","));
	});

	it("挑词保持原顺序且是原词表的子集", () => {
		for (const domain of DOMAINS) {
			const all = getHotwords(domain);
			const picked = getWhisperPromptWords(domain);
			for (const word of picked) {
				expect(all).toContain(word);
			}
			const indices = picked.map((w) => all.indexOf(w));
			expect([...indices].sort((a, b) => a - b)).toEqual(indices);
		}
	});

	it("prompt 以领域前缀开头并包含挑选出的全部词", () => {
		for (const domain of DOMAINS) {
			const prompt = buildWhisperPrompt(domain);
			const picked = getWhisperPromptWords(domain);
			for (const word of picked) {
				expect(prompt).toContain(word);
			}
		}
	});
});

describe("GPT system prompt 片段", () => {
	it("完整包含该领域**全部**热词（LLM 侧没有 224 token 限制）", () => {
		for (const domain of DOMAINS) {
			const fragment = buildGptSystemPromptFragment(domain);
			const words = getHotwords(domain);
			expect(fragment).toContain(words[0]);
			expect(fragment).toContain(words[words.length - 1]);
			// 逐词校验
			const missing = words.filter((word) => !fragment.includes(`- ${word}`));
			expect(missing).toEqual([]);
		}
	});

	it("含领域中文名", () => {
		// 名称以词包自身的 name_zh 为准（medical 是「医疗」而非「医学」）
		for (const domain of DOMAINS) {
			const pack = getHotwordPack(domain);
			expect(pack).not.toBeNull();
			if (!pack) continue;
			expect(buildGptSystemPromptFragment(domain)).toContain(pack.name_zh);
		}
	});
});

describe("suggestDomain 自动域匹配", () => {
	const cases: Array<[string, HotwordDomain]> = [
		["今天讲一下原告被告的诉讼流程和仲裁管辖", "legal"],
		["高血压和糖尿病的用药与血糖监测", "medical"],
		["淘宝直播带货的 SKU 和 GMV 怎么看", "ecommerce"],
		["考研数学的复习规划和期末绩点", "education"],
		["A股股票的市盈率和止损怎么设", "finance"],
		["这个版本的打野出装和铭文搭配", "gaming"],
		["用 Docker 把微服务容器化部署", "tech"],
		["私域引流转化的 ROI 和 CTR 投放", "marketing"],
		["完全无关的一句话也就这样", "general"],
	];

	it.each(cases)("「%s」→ %s", (text, expected) => {
		expect(suggestDomain(text)).toBe(expected);
	});
});
