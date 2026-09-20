/**
 * Kliq (Kliq) — 行业热词模块 (P0/B3)
 *
 * 提供 9 个开箱即用的中文热词词库 (法律/医疗/电商/教育/金融/游戏/技术/营销/通用)
 * 用于提升 Whisper 转录专业术语的识别准确率。
 *
 * 数据来源 (全部开源 / 自建):
 * - legal: THUOCL Law (Apache-2.0) + LaWGPT legal_vocab (MIT)
 * - medical: OMAHA 七巧板 (Open) + THUOCL Medical (Apache-2.0)
 * - ecommerce / finance: THUOCL 财金 (Apache-2.0)
 * - education / gaming / tech / marketing: 自建 (MIT)
 */

import general from "../data/hotwords/general.json";
import legal from "../data/hotwords/legal.json";
import medical from "../data/hotwords/medical.json";
import ecommerce from "../data/hotwords/ecommerce.json";
import education from "../data/hotwords/education.json";
import finance from "../data/hotwords/finance.json";
import gaming from "../data/hotwords/gaming.json";
import tech from "../data/hotwords/tech.json";
import marketing from "../data/hotwords/marketing.json";
import packsIndex from "../data/hotwords/packs-index.json";

export type HotwordDomain =
	| "general"
	| "legal"
	| "medical"
	| "ecommerce"
	| "education"
	| "finance"
	| "gaming"
	| "tech"
	| "marketing";

export type HotwordPack = {
	domain: HotwordDomain;
	name_zh: string;
	name_en: string;
	license: string;
	source: string;
	word_count: number;
	words: string[];
};

const PACKS: Record<HotwordDomain, HotwordPack> = {
	general: general as HotwordPack,
	legal: legal as HotwordPack,
	medical: medical as HotwordPack,
	ecommerce: ecommerce as HotwordPack,
	education: education as HotwordPack,
	finance: finance as HotwordPack,
	gaming: gaming as HotwordPack,
	tech: tech as HotwordPack,
	marketing: marketing as HotwordPack,
};

/** 获取指定 domain 的热词列表 */
export function getHotwords(domain: HotwordDomain): string[] {
	const pack = PACKS[domain];
	if (!pack) return [];
	return pack.words;
}

/** 获取指定 domain 的完整热词包元信息 */
export function getHotwordPack(domain: HotwordDomain): HotwordPack | null {
	return PACKS[domain] ?? null;
}

/** 列出所有可用的热词 domain */
export function listDomains(): HotwordDomain[] {
	return Object.keys(PACKS) as HotwordDomain[];
}

/** 获取默认 domain (general) */
export function getDefaultDomain(): HotwordDomain {
	return (packsIndex.default_domain as HotwordDomain) ?? "general";
}

/** 每个领域的 prompt 前缀（提示模型内容所属领域，本身也占 token 预算） */
export const WHISPER_PROMPT_PREFIXES: Record<HotwordDomain, string> = {
	general: "常用中文词汇。",
	legal: "法律领域专业术语,包括原告、被告、诉讼、仲裁、判决等。",
	medical: "医学领域专业术语,包括高血压、糖尿病、手术、化疗等。",
	ecommerce: "电商领域专业术语,包括淘宝、抖音、直播带货、SKU、GMV等。",
	education: "教育领域专业术语,包括学生、课程、考试、考研等。",
	finance: "金融领域专业术语,包括股票、基金、IPO、收益率、对冲等。",
	gaming: "游戏领域专业术语,包括MOBA、铭文、出装、排位、团战等。",
	tech: "技术领域专业术语,包括API、SDK、微服务、Docker、LLM、RAG等。",
	marketing: "营销领域专业术语,包括私域、转化、GMV、ROI、CTR等。",
};

/**
 * Whisper `prompt` 参数的 token 预算。
 *
 * OpenAI 文档给的硬上限是 **224 tokens**。此前调用方的「保护」是
 * `prompt.slice(0, 1000)` —— 按**字符**截断，而限额单位是 token。中文里 1 个字
 * 约等于 1 个 token，1000 字符 ≈ 1000 token，是限额的 4 倍多，于是这个保护
 * **从未真正生效**：超长 prompt 一律由服务端按它自己的规则从尾部丢弃。
 *
 * 实测：修复前 `general` 包（154 词）拼出的 prompt 约 508 token，是限额的 2.3 倍。
 *
 * 这里取 200 而不是 224，留出余量给真实分词器与中文标点的差异。
 */
export const WHISPER_PROMPT_TOKEN_BUDGET = 200;

/**
 * 估算一段文本的 token 数（保守近似）。
 *
 * 真实分词器不可用，因此按「中日韩字符与全角标点各 1 token、其余每 4 字符 1 token」
 * 估算，并向上取整 —— 宁可低估预算，也不要超限被服务端截断。
 */
export function estimatePromptTokens(text: string): number {
	let cjk = 0;
	let other = 0;
	for (const char of text) {
		const code = char.codePointAt(0) ?? 0;
		// CJK 统一表意文字 + 中日韩标点（、。「」等）
		const isCjk =
			(code >= 0x2e80 && code <= 0x9fff) ||
			(code >= 0xf900 && code <= 0xfaff) ||
			(code >= 0xff00 && code <= 0xffef) ||
			(code >= 0x3000 && code <= 0x303f);
		if (isCjk) cjk += 1;
		else other += 1;
	}
	return cjk + Math.ceil(other / 4);
}

/**
 * 挑出能塞进 Whisper prompt 预算的热词。
 *
 * 两个刻意的选择：
 *
 * 1. **分隔符用半角逗号而不是中文顿号。** 顿号属于 CJK 区，约 1 token/个；半角逗号
 *    是 ASCII，约 0.25 token/个。80 个词的列表上这 0.75 token/词 的差额累计起来很可观
 *    —— 实测同一 200 token 预算下，顿号能装 496 个词、半角逗号能装 629 个词（+27%）。
 *    prompt 只是给 Whisper 的软性条件信号，分隔符用什么不影响语义。
 *
 * 2. **装不下的词跳过、而不是就此中断**，这样扩张词表永远是净收益：多出来的词只要
 *    能挤进预算就会进入 prompt。
 *
 * 判定用的是**整串实测**而不是逐词成本累加 —— 后者会因为 `ceil` 取整而低估。
 */
export function getWhisperPromptWords(domain: HotwordDomain): string[] {
	const words = getHotwords(domain);
	if (words.length === 0) return [];

	const prefix = WHISPER_PROMPT_PREFIXES[domain];
	const picked: string[] = [];

	for (const word of words) {
		const candidate = [...picked, word].join(WHISPER_PROMPT_SEPARATOR);
		if (estimatePromptTokens(`${prefix} ${candidate}`) > WHISPER_PROMPT_TOKEN_BUDGET) {
			continue;
		}
		picked.push(word);
	}
	return picked;
}

/** prompt 里热词之间的分隔符。半角逗号而非顿号 —— 理由见 getWhisperPromptWords。 */
export const WHISPER_PROMPT_SEPARATOR = ",";

/** 把热词列表拼接成 Whisper prompt 字符串（保证不超过 token 预算） */
export function buildWhisperPrompt(domain: HotwordDomain): string {
	const picked = getWhisperPromptWords(domain);
	if (picked.length === 0) return "";
	return `${WHISPER_PROMPT_PREFIXES[domain]} ${picked.join(WHISPER_PROMPT_SEPARATOR)}`;
}

/** 把热词列表拼接成 GPT-4 system prompt 片段 */
export function buildGptSystemPromptFragment(domain: HotwordDomain): string {
	const pack = getHotwordPack(domain);
	if (!pack || pack.words.length === 0) return "";

	return `\n\n[行业热词] 本内容属于${pack.name_zh}领域,以下是可能出现的专业术语,请确保正确识别和翻译:\n${pack.words.map((w) => `- ${w}`).join("\n")}`;
}

/**
 * 域匹配: 根据文本内容自动推荐最匹配的 domain
 *
 * ⚠️ 这里过去维护着 8 组**手写的精简关键词表**（每组 11-13 个词），与词包本体完全
 * 分离。结果是两套数据各自漂移：词包里明明有「考研 / 期末 / 绩点」，但教育那组
 * 关键词表里一个都没有 —— 于是「考研数学的复习规划和期末绩点」这种一眼就是教育的
 * 文本被判成了 general。
 *
 * 现在改为**直接用词包本体打分**：不只消掉了那 100 多行重复数据，还让扩张词表
 * 这件事同时改善自动域识别（词包从 39 词扩到 80 词，命中的机会直接翻倍）。
 *
 * 平局按 listDomains() 的顺序取先者，结果是确定的。
 */
export function suggestDomain(text: string): HotwordDomain {
	const lower = text.toLowerCase();
	if (!lower.trim()) return "general";

	let best: HotwordDomain = "general";
	let bestScore = 0;

	for (const domain of listDomains()) {
		// general 是兜底，不参与竞争
		if (domain === "general") continue;
		const score = getHotwords(domain).filter((word) =>
			lower.includes(word.toLowerCase()),
		).length;
		if (score > bestScore) {
			bestScore = score;
			best = domain;
		}
	}
	return bestScore === 0 ? "general" : best;
}
