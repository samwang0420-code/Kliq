/**
 * Kliq — AI 智能剪辑 (P1/A3+A4+A5)
 *
 * A3 智能加速: 检测"等待/加载/稍等/loading"段 → 建议 2x 加速
 * A4 自动取景: 检测"重点内容"段 (GPT-4 判) → 建议 zoom-in
 * A5 一键剪辑: A1+A2+A3+A4 流水线入口
 *
 * 输出 speedRegion / zoomRegion 让 UI 一键应用到 timeline
 */

import { transcribeWithWhisper } from "./openai-client";
import { chatCompletion } from "./openai-client";
import type { HotwordDomain } from "../hotwords";

export type SpeedRegion = {
	id: string;
	startMs: number;
	endMs: number;
	durationMs: number;
	speed: number; // 1.5 / 2.0 / 3.0
	reason: string;
};

export type ZoomRegion = {
	id: string;
	startMs: number;
	endMs: number;
	durationMs: number;
	zoomLevel: number; // 1.0 = no zoom, 1.5 = zoom-in 1.5x, 2.0 = 2x
	reason: string;
};

export type SmartEditOptions = {
	audioFile: File | Blob;
	videoDurationMs?: number;
	hotwordDomain?: HotwordDomain;
	language?: string;
};

export type SmartEditResult = {
	speedRegions: SpeedRegion[];
	zoomRegions: ZoomRegion[];
	totalSpeedupMs: number;
	totalZoomMs: number;
};

/** A3 检测智能加速段 */
export async function detectSpeedRegions(options: SmartEditOptions): Promise<SpeedRegion[]> {
	const language = options.language ?? "zh";
	const whisperResult = await transcribeWithWhisper({
		audioFile: options.audioFile,
		language,
		responseFormat: "verbose_json",
		hotwordDomain: options.hotwordDomain,
	});

	const segments = whisperResult.segments ?? [];
	const waitKeywords = [
		"稍等",
		"等一下",
		"等待",
		"加载",
		"loading",
		"请稍候",
		"等我",
		"我看看",
		"我看一下",
		"我看一眼",
		"打开",
	];

	const speedRegions: SpeedRegion[] = [];

	for (const seg of segments) {
		const text = (seg.text ?? "").toLowerCase();
		const match = waitKeywords.find((kw) => text.includes(kw));
		if (!match) continue;

		const startMs = Math.round((seg.start ?? 0) * 1000);
		const endMs = Math.round((seg.end ?? 0) * 1000);
		const durationMs = endMs - startMs;

		// 短停顿(<800ms) 跳过, 长停顿(>800ms) 给 2x
		if (durationMs < 800) continue;

		speedRegions.push({
			id: `speed-${startMs}`,
			startMs,
			endMs,
			durationMs,
			speed: 2.0,
			reason: `检测到 "${match}", 建议 2x 加速`,
		});
	}

	return speedRegions;
}

/** A4 检测自动取景 (简化版: GPT-4 标重点句) */
export async function detectZoomRegions(options: SmartEditOptions): Promise<ZoomRegion[]> {
	const language = options.language ?? "zh";
	const whisperResult = await transcribeWithWhisper({
		audioFile: options.audioFile,
		language,
		responseFormat: "verbose_json",
		hotwordDomain: options.hotwordDomain,
	});

	const segments = whisperResult.segments ?? [];
	if (segments.length === 0) return [];

	const fullText = segments
		.map(
			(s, i) =>
				`[${i}] ${(s.start ?? 0).toFixed(1)}-${(s.end ?? 0).toFixed(1)}s: ${s.text ?? ""}`,
		)
		.join("\n");

	// GPT-4 标重点句 (返回 JSON 数组)
	const prompt = `你是录屏剪辑助手。给定带时间戳的转录文本, 选出最多 5 段"最需要强调/放大显示"的段落 (例如核心观点/操作步骤/关键数据/高潮时刻)。

要求:
- 只输出 JSON 数组, 不要其他文字
- 每个元素含: index (段落索引), reason (简短原因)
- 总数 ≤ 5

转录:
${fullText}`;

	try {
		const response = await chatCompletion({
			messages: [
				{ role: "system", content: "你是录屏剪辑助手, 只输出 JSON 数组。" },
				{ role: "user", content: prompt },
			],
			temperature: 0.3,
			maxTokens: 500,
		});

		const jsonMatch = response.match(/\[[\s\S]*\]/);
		if (!jsonMatch) return [];

		const parsed = JSON.parse(jsonMatch[0]) as Array<{ index: number; reason: string }>;
		const zoomRegions: ZoomRegion[] = [];

		for (const item of parsed) {
			const seg = segments[item.index];
			if (!seg) continue;
			const startMs = Math.round((seg.start ?? 0) * 1000);
			const endMs = Math.round((seg.end ?? 0) * 1000);
			zoomRegions.push({
				id: `zoom-${startMs}`,
				startMs,
				endMs,
				durationMs: endMs - startMs,
				zoomLevel: 1.5,
				reason: item.reason ?? "重点内容",
			});
		}
		return zoomRegions;
	} catch (err) {
		console.warn("[smart-edit] GPT-4 zoom detection failed:", err);
		return [];
	}
}

/** A5 一键剪辑组合: 串行跑 A1 + A2 + A3 + A4 */
export type OneClickEditOptions = SmartEditOptions & {
	includeSilence?: boolean;
	includeFillers?: boolean;
	includeSpeed?: boolean;
	includeZoom?: boolean;
	thresholdSilenceMs?: number;
};

export type OneClickEditResult = SmartEditResult & {
	silenceCount: number;
	fillerCount: number;
};

export async function oneClickEdit(options: OneClickEditOptions): Promise<OneClickEditResult> {
	const includeSilence = options.includeSilence ?? true;
	const includeFillers = options.includeFillers ?? true;
	const includeSpeed = options.includeSpeed ?? true;
	const includeZoom = options.includeZoom ?? true;

	const whisperResult = await transcribeWithWhisper({
		audioFile: options.audioFile,
		language: options.language ?? "zh",
		responseFormat: "verbose_json",
		hotwordDomain: options.hotwordDomain,
	});

	const segments = whisperResult.segments ?? [];
	const thresholdMs = options.thresholdSilenceMs ?? 1500;

	// 复用 detectSilenceRegions 算法
	const silenceCount = includeSilence ? countSilenceGaps(segments, thresholdMs) : 0;
	const fillerCount = includeFillers
		? countFillerSegments(segments, options.language ?? "zh")
		: 0;

	// 复用 A3 + A4 (它们内部会再调 Whisper, 已有缓存可走)
	const [speedRegions, zoomRegions] = await Promise.all([
		includeSpeed ? detectSpeedRegions(options) : Promise.resolve([]),
		includeZoom ? detectZoomRegions(options) : Promise.resolve([]),
	]);

	const totalSpeedupMs = speedRegions.reduce(
		(sum, r) => sum + Math.round(r.durationMs * (1 - 1 / r.speed)),
		0,
	);
	const totalZoomMs = zoomRegions.reduce((sum, r) => sum + r.durationMs, 0);

	return {
		speedRegions,
		zoomRegions,
		totalSpeedupMs,
		totalZoomMs,
		silenceCount,
		fillerCount,
	};
}

function countSilenceGaps(
	segments: { start?: number; end?: number }[],
	thresholdMs: number,
): number {
	if (segments.length === 0) return 0;
	let count = 0;
	const firstStart = Math.round((segments[0].start ?? 0) * 1000);
	if (firstStart > thresholdMs) count++;
	for (let i = 0; i < segments.length - 1; i++) {
		const gap = Math.round(((segments[i + 1].start ?? 0) - (segments[i].end ?? 0)) * 1000);
		if (gap > thresholdMs) count++;
	}
	return count;
}

function countFillerSegments(segments: { text?: string }[], language: string): number {
	const fillers =
		language === "en"
			? ["um", "uh", "like", "you know"]
			: ["那个", "然后", "就是说", "嗯", "呃"];
	let count = 0;
	for (const seg of segments) {
		const text = (seg.text ?? "").toLowerCase();
		if (fillers.some((f) => text.includes(f))) count++;
	}
	return count;
}

/** 把 speed regions 转成 SRT */
export function speedRegionsToSrt(regions: SpeedRegion[]): string {
	return regions
		.map(
			(r, i) =>
				`${i + 1}\n${formatTime(r.startMs)} --> ${formatTime(r.endMs)}\n[${r.speed}x ${r.reason}]\n`,
		)
		.join("\n");
}

/** 把 zoom regions 转成 SRT */
export function zoomRegionsToSrt(regions: ZoomRegion[]): string {
	return regions
		.map(
			(r, i) =>
				`${i + 1}\n${formatTime(r.startMs)} --> ${formatTime(r.endMs)}\n[Zoom ${r.zoomLevel}x ${r.reason}]\n`,
		)
		.join("\n");
}

function formatTime(ms: number): string {
	const h = Math.floor(ms / 3_600_000);
	const m = Math.floor((ms % 3_600_000) / 60_000);
	const s = Math.floor((ms % 60_000) / 1000);
	const tail = ms % 1000;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(tail).padStart(3, "0")}`;
}
