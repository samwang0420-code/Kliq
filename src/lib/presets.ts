/**
 * Kliq — 场景化模板 + 平台尺寸预设 (P1/E1-E5 + F1-F4)
 *
 * 5 个场景模板: 直播 / 教学 / 演示 / 面试 / 销售
 * 4 个平台预设: 抖音 9:16 / 小红书 3:4 / YouTube Shorts / B站+视频号
 *
 * 用户在新建项目时选模板, 自动应用推荐配置 + AI 热词
 */

export type ScenarioTemplateId =
	| "liveStream"
	| "teaching"
	| "demo"
	| "interview"
	| "sales";

export type PlatformPresetId =
	| "douyin"
	| "xiaohongshu"
	| "youtubeShorts"
	| "bilibili"
	| "wechatChannels";

export type ScenarioTemplate = {
	id: ScenarioTemplateId;
	name: string;
	nameEn: string;
	description: string;
	recommendedHotwordDomain: import("./hotwords").HotwordDomain;
	recommendedCrop: { width: number; height: number };
	recommendedFps: number;
	recommendedMaxDurationMs?: number;
	features: string[];
};

export const SCENARIO_TEMPLATES: Record<ScenarioTemplateId, ScenarioTemplate> = {
	liveStream: {
		id: "liveStream",
		name: "直播回放",
		nameEn: "Live Stream",
		description: "适合直播切片/回放剪辑, 自动裁剪长时间停顿",
		recommendedHotwordDomain: "ecommerce",
		recommendedCrop: { width: 1080, height: 1920 },
		recommendedFps: 30,
		recommendedMaxDurationMs: 3_600_000, // 1 小时
		features: ["AI 去静音", "AI 章节", "AI 标题备选", "AI 标签"],
	},
	teaching: {
		id: "teaching",
		name: "在线教学",
		nameEn: "Teaching",
		description: "适合课程录屏, 自动识别教学章节, 生成课件摘要",
		recommendedHotwordDomain: "education",
		recommendedCrop: { width: 1920, height: 1080 },
		recommendedFps: 30,
		features: ["AI 章节", "AI 摘要", "AI 标题", "AI 标签", "AI 字幕"],
	},
	demo: {
		id: "demo",
		name: "产品演示",
		nameEn: "Product Demo",
		description: "适合软件/工具演示, 自动识别操作步骤, 突出重点",
		recommendedHotwordDomain: "tech",
		recommendedCrop: { width: 1920, height: 1080 },
		recommendedFps: 30,
		features: ["AI 去填充词", "AI 智能加速", "AI 自动取景", "AI 章节"],
	},
	interview: {
		id: "interview",
		name: "面试录制",
		nameEn: "Interview",
		description: "适合面试/对话场景, 自动识别问答对, 双向字幕",
		recommendedHotwordDomain: "general",
		recommendedCrop: { width: 1280, height: 720 },
		recommendedFps: 30,
		features: ["AI 双语字幕", "AI 摘要", "AI 章节", "AI 校对"],
	},
	sales: {
		id: "sales",
		name: "销售通话",
		nameEn: "Sales Call",
		description: "适合销售/客服通话录制, 识别客户异议 + 关键需求",
		recommendedHotwordDomain: "ecommerce",
		recommendedCrop: { width: 1280, height: 720 },
		recommendedFps: 30,
		features: ["AI 摘要", "AI 章节", "AI 标题", "AI 标签"],
	},
};

export type PlatformPreset = {
	id: PlatformPresetId;
	name: string;
	nameEn: string;
	platform: string;
	aspectRatio: string; // e.g. "9:16"
	width: number;
	height: number;
	maxDurationMs?: number;
	recommendedFps: number;
	notes: string;
};

export const PLATFORM_PRESETS: Record<PlatformPresetId, PlatformPreset> = {
	douyin: {
		id: "douyin",
		name: "抖音 9:16",
		nameEn: "Douyin 9:16",
		platform: "抖音",
		aspectRatio: "9:16",
		width: 1080,
		height: 1920,
		maxDurationMs: 15 * 60_000, // 15 分钟
		recommendedFps: 30,
		notes: "竖屏, 15 分钟以内, 适合短视频切片",
	},
	xiaohongshu: {
		id: "xiaohongshu",
		name: "小红书 3:4",
		nameEn: "Xiaohongshu 3:4",
		platform: "小红书",
		aspectRatio: "3:4",
		width: 1080,
		height: 1440,
		maxDurationMs: 5 * 60_000, // 5 分钟
		recommendedFps: 30,
		notes: "竖屏 3:4, 5 分钟以内, 教程类内容最佳",
	},
	youtubeShorts: {
		id: "youtubeShorts",
		name: "YouTube Shorts",
		nameEn: "YouTube Shorts",
		platform: "YouTube",
		aspectRatio: "9:16",
		width: 1080,
		height: 1920,
		maxDurationMs: 60_000, // 60 秒
		recommendedFps: 30,
		notes: "竖屏 60 秒以内, 需强 hook 前 3 秒",
	},
	bilibili: {
		id: "bilibili",
		name: "B站横屏 16:9",
		nameEn: "Bilibili 16:9",
		platform: "B站",
		aspectRatio: "16:9",
		width: 1920,
		height: 1080,
		recommendedFps: 60,
		notes: "横屏 1080P 60fps, 适合长视频",
	},
	wechatChannels: {
		id: "wechatChannels",
		name: "微信视频号",
		nameEn: "WeChat Channels",
		platform: "微信视频号",
		aspectRatio: "3:4",
		width: 1080,
		height: 1440,
		maxDurationMs: 3 * 60_000, // 3 分钟
		recommendedFps: 30,
		notes: "竖屏 3:4, 3 分钟以内",
	},
};

export function getScenarioTemplate(id: ScenarioTemplateId): ScenarioTemplate {
	return SCENARIO_TEMPLATES[id];
}

export function getPlatformPreset(id: PlatformPresetId): PlatformPreset {
	return PLATFORM_PRESETS[id];
}

export function listScenarioTemplates(): ScenarioTemplate[] {
	return Object.values(SCENARIO_TEMPLATES);
}

export function listPlatformPresets(): PlatformPreset[] {
	return Object.values(PLATFORM_PRESETS);
}
