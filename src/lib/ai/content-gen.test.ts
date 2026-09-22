/**
 * §51 Kliq — content-gen.ts 端到端测试
 *
 * 覆盖 5 个 GPT-4 内容生成函数:
 * - generateChapters (视频章节)
 * - generateSummary (摘要 + 亮点)
 * - generateTitles (5 个候选标题)
 * - generateTags (10 个 SEO 标签)
 * - generateSocialCopy (4 平台社媒文案)
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
	generateChapters,
	generateSummary,
	generateTitles,
	generateTags,
	generateSocialCopy,
} from "./content-gen";
import { setupElectronApi, mockFetchJson } from "./_test-helper";

const TRANSCRIPT = "今天我们讨论跨境电商增长策略。先讲流量获取, 再讲转化率优化, 最后讲复购留存。";

beforeEach(() => {
	setupElectronApi({ openaiKey: "sk-test", chatProvider: "openai" });
});

describe("generateChapters", () => {
	it("happy path: 解析 GPT JSON 数组为 Chapter[]", async () => {
		const chaptersJson = JSON.stringify([
			{ id: 1, start: 0.0, end: 30.5, title: "开场" },
			{ id: 2, start: 30.5, end: 60.2, title: "流量获取" },
			{ id: 3, start: 60.2, end: 120.0, title: "转化与复购" },
		]);
		mockFetchJson({ choices: [{ message: { content: chaptersJson } }] });
		const chapters = await generateChapters(TRANSCRIPT, 120.0);
		expect(chapters).toHaveLength(3);
		expect(chapters[0].title).toBe("开场");
		expect(chapters[2].end).toBeCloseTo(120.0);
	});

	it("videoDuration ≤ 0 → 抛错", async () => {
		await expect(generateChapters(TRANSCRIPT, 0)).rejects.toThrow(/视频时长/);
		await expect(generateChapters(TRANSCRIPT, NaN)).rejects.toThrow(/视频时长/);
	});

	it("GPT 返非 JSON → 返空数组 (优雅降级)", async () => {
		mockFetchJson({ choices: [{ message: { content: "抱歉我无法识别章节" } }] });
		const chapters = await generateChapters(TRANSCRIPT, 60.0);
		expect(chapters).toEqual([]);
	});
});

describe("generateSummary", () => {
	it("happy path: 解析 brief + highlights", async () => {
		const summaryJson = JSON.stringify({
			brief: "讲解跨境电商三大核心: 流量、转化、复购",
			highlights: ["讲流量获取", "讲转化率优化", "讲复购留存"],
		});
		mockFetchJson({ choices: [{ message: { content: summaryJson } }] });
		const summary = await generateSummary(TRANSCRIPT);
		expect(summary.brief).toContain("跨境电商");
		expect(summary.highlights).toHaveLength(3);
		expect(summary.timestamp).toBeGreaterThan(0);
	});

	it("GPT 返损坏 JSON → 返空 summary (不抛错)", async () => {
		mockFetchJson({ choices: [{ message: { content: "invalid json{[" } }] });
		const summary = await generateSummary(TRANSCRIPT);
		expect(summary.brief).toBe("");
		expect(summary.highlights).toEqual([]);
	});

	it("highlights 缺失字段 → 兜底空数组", async () => {
		mockFetchJson({ choices: [{ message: { content: JSON.stringify({ brief: "x" }) } }] });
		const summary = await generateSummary(TRANSCRIPT);
		expect(summary.highlights).toEqual([]);
	});
});

describe("generateTitles", () => {
	it("happy path: 解析 5 个标题候选", async () => {
		const titlesJson = JSON.stringify([
			{ title: "跨境增长 3 大心法", style: "neutral" },
			{ title: "震惊! 跨境电商这样做月入百万", style: "clickbait" },
			{ title: "从 0 到 1 构建跨境增长体系", style: "professional" },
			{ title: "跨境小白入门指南", style: "neutral" },
			{ title: "跨境圈都在偷学的 3 个技巧", style: "clickbait" },
		]);
		mockFetchJson({ choices: [{ message: { content: titlesJson } }] });
		const titles = await generateTitles(TRANSCRIPT);
		expect(titles).toHaveLength(5);
		expect(titles[1].style).toBe("clickbait");
	});

	it("GPT 返非 JSON → 返空数组", async () => {
		mockFetchJson({ choices: [{ message: { content: "我建议标题叫: 跨境指南" } }] });
		const titles = await generateTitles(TRANSCRIPT);
		expect(titles).toEqual([]);
	});
});

describe("generateTags", () => {
	it("happy path: 解析 10 个 SEO 标签 (去 # 号)", async () => {
		const tagsJson = JSON.stringify([
			"#跨境电商",
			"#增长策略",
			"流量获取",
			"转化率",
			"复购留存",
			"跨境",
			"电商运营",
			"海外市场",
			"营销策略",
			"数据驱动",
		]);
		mockFetchJson({ choices: [{ message: { content: tagsJson } }] });
		const tags = await generateTags(TRANSCRIPT);
		expect(tags).toHaveLength(10);
		expect(tags[0]).toBe("跨境电商");
		expect(tags.every((t) => !t.startsWith("#"))).toBe(true);
	});

	it("标签数 > 10 → 只取前 10", async () => {
		const tagsJson = JSON.stringify(Array.from({ length: 15 }, (_, i) => `tag${i}`));
		mockFetchJson({ choices: [{ message: { content: tagsJson } }] });
		const tags = await generateTags(TRANSCRIPT);
		expect(tags).toHaveLength(10);
	});

	it("GPT 返非 JSON 数组 → 返空数组", async () => {
		mockFetchJson({ choices: [{ message: { content: "跨境, 电商, 增长" } }] });
		const tags = await generateTags(TRANSCRIPT);
		expect(tags).toEqual([]);
	});
});

describe("generateSocialCopy", () => {
	it("happy path: 解析 4 平台文案", async () => {
		const socialJson = JSON.stringify({
			twitter: "Cross-border e-commerce growth 3 keys: traffic, conversion, retention. #跨境 #增长",
			xiaohongshu: "姐妹们! 今天分享跨境电商 3 大心法 💰 #跨境电商 #增长 #流量 #运营 #复购",
			wechat: "本文从流量、转化、复购三个维度, 系统拆解跨境电商增长方法论。",
			bilibili: "【跨境电商增长心法】流量获取 + 转化优化 + 复购留存 一条视频讲透",
		});
		mockFetchJson({ choices: [{ message: { content: socialJson } }] });
		const copy = await generateSocialCopy(TRANSCRIPT);
		expect(copy.twitter).toContain("traffic");
		expect(copy.xiaohongshu).toContain("姐妹们");
		expect(copy.wechat).toContain("跨境电商");
		expect(copy.bilibili).toContain("跨境");
	});

	it("GPT 返损坏 JSON → 返空 4 字段 (不抛错)", async () => {
		mockFetchJson({ choices: [{ message: { content: "我建议发推: 跨境指南" } }] });
		const copy = await generateSocialCopy(TRANSCRIPT);
		expect(copy.twitter).toBe("");
		expect(copy.xiaohongshu).toBe("");
		expect(copy.wechat).toBe("");
		expect(copy.bilibili).toBe("");
	});
});
