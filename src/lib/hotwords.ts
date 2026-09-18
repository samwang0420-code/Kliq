/**
 * 言镜 (Yanjing Recorder) — 行业热词模块 (P0/B3)
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

/** 把热词列表拼接成 Whisper prompt 字符串 */
export function buildWhisperPrompt(domain: HotwordDomain): string {
	const words = getHotwords(domain);
	if (words.length === 0) return "";

	const prefixMap: Record<HotwordDomain, string> = {
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

	return `${prefixMap[domain]} ${words.join("、")}`;
}

/** 把热词列表拼接成 GPT-4 system prompt 片段 */
export function buildGptSystemPromptFragment(domain: HotwordDomain): string {
	const pack = getHotwordPack(domain);
	if (!pack || pack.words.length === 0) return "";

	return `\n\n[行业热词] 本内容属于${pack.name_zh}领域,以下是可能出现的专业术语,请确保正确识别和翻译:\n${pack.words.map((w) => `- ${w}`).join("\n")}`;
}

/** 域匹配: 根据文本内容自动推荐最匹配的 domain */
export function suggestDomain(text: string): HotwordDomain {
	const lower = text.toLowerCase();

	const legalKeywords = ["原告", "被告", "诉讼", "仲裁", "判决", "法律", "合同", "民法", "刑法", "知识产权", "专利", "商标"];
	const medicalKeywords = ["高血压", "糖尿病", "医生", "患者", "手术", "医院", "药品", "症状", "诊断", "治疗", "CT", "MRI"];
	const ecommerceKeywords = ["淘宝", "天猫", "京东", "抖音", "直播", "带货", "SKU", "GMV", "店铺", "卖家", "买家"];
	const educationKeywords = ["学生", "老师", "教授", "课程", "教学", "考试", "教材", "课件", "学校", "大学", "中学", "小学"];
	const financeKeywords = ["股票", "基金", "债券", "期货", "外汇", "利率", "央行", "美联储", "IPO", "市盈率", "收益率", "止损", "杠杆"];
	const gamingKeywords = ["MOBA", "FPS", "排位", "上分", "铭文", "出装", "走位", "打野", "团战", "五杀", "MVP", "段位", "钻石"];
	const techKeywords = ["API", "SDK", "前端", "后端", "数据库", "缓存", "Docker", "微服务", "算法", "深度学习", "LLM", "RAG"];
	const marketingKeywords = ["私域", "公域", "引流", "转化", "复购", "裂变", "DAU", "GMV", "ROI", "CTR", "投放", "短视频"];

	const scores = {
		legal: legalKeywords.filter((k) => lower.includes(k)).length,
		medical: medicalKeywords.filter((k) => lower.includes(k)).length,
		ecommerce: ecommerceKeywords.filter((k) => lower.includes(k)).length,
		education: educationKeywords.filter((k) => lower.includes(k)).length,
		finance: financeKeywords.filter((k) => lower.includes(k)).length,
		gaming: gamingKeywords.filter((k) => lower.includes(k)).length,
		tech: techKeywords.filter((k) => lower.includes(k)).length,
		marketing: marketingKeywords.filter((k) => lower.includes(k)).length,
	};

	const maxScore = Math.max(
		scores.legal,
		scores.medical,
		scores.ecommerce,
		scores.education,
		scores.finance,
		scores.gaming,
		scores.tech,
		scores.marketing,
	);
	if (maxScore === 0) return "general";

	const winner = (Object.entries(scores) as Array<[HotwordDomain, number]>).find(
		([, s]) => s === maxScore,
	);
	return winner?.[0] ?? "general";
}
