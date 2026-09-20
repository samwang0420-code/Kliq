/**
 * Kliq — AI 去静音段 (P0/A1)
 *
 * 调用 OpenAI Whisper 转录音频 → 解析 segments 之间的 gap → 输出 silence regions
 *
 * 典型应用: 录屏中说话停顿 > 1.5s 的部分, 自动标记让用户一键应用为静音覆盖
 */

import { transcribeWithWhisper } from "./openai-client";
import type { HotwordDomain } from "../hotwords";

export type SilenceRegion = {
	/** 唯一 ID, 用于 React key + apply 操作 */
	id: string;
	/** 起始时间 (毫秒) */
	startMs: number;
	/** 结束时间 (毫秒) */
	endMs: number;
	/** 持续时间 (毫秒) */
	durationMs: number;
};

export type DetectSilenceOptions = {
	audioFile: File | Blob;
	/** 静音判定阈值 (毫秒), 默认 1500ms */
	thresholdMs?: number;
	/** 视频总时长 (毫秒), 用于处理最后一段静音 */
	videoDurationMs?: number;
	/** 热词域,提升 Whisper 识别准确率 */
	hotwordDomain?: HotwordDomain;
	/** Whisper 语言提示, 默认 zh */
	language?: string;
};

export type DetectSilenceResult = {
	totalDurationMs: number;
	totalSilenceMs: number;
	silenceRegions: SilenceRegion[];
	/** 节省百分比, 0-100 */
	savingsPercent: number;
};

/**
 * 检测音频中的静音段
 *
 * 算法:
 * 1. 调用 Whisper 转录,获取带 timestamps 的 segments
 * 2. 计算 segment[i].end 到 segment[i+1].start 之间的 gap
 * 3. gap > thresholdMs → 视为 silence
 * 4. 视频开头 (0 → segments[0].start) 与结尾 (segments[last].end → videoDurationMs) 也算 silence
 */
export async function detectSilenceRegions(
	options: DetectSilenceOptions,
): Promise<DetectSilenceResult> {
	const thresholdMs = options.thresholdMs ?? 1500;
	const language = options.language ?? "zh";

	const whisperResult = await transcribeWithWhisper({
		audioFile: options.audioFile,
		language,
		responseFormat: "verbose_json",
		hotwordDomain: options.hotwordDomain,
	});

	const segments = whisperResult.segments ?? [];
	if (segments.length === 0) {
		return {
			totalDurationMs: options.videoDurationMs ?? 0,
			totalSilenceMs: 0,
			silenceRegions: [],
			savingsPercent: 0,
		};
	}

	const regions: SilenceRegion[] = [];
	const totalDurationMs =
		options.videoDurationMs ??
		(whisperResult.duration
			? Math.round(whisperResult.duration * 1000)
			: Math.round((segments[segments.length - 1].end ?? 0) * 1000));

	// 1. 开头静音
	const firstStart = Math.round((segments[0].start ?? 0) * 1000);
	if (firstStart > thresholdMs) {
		regions.push(buildSilenceRegion(0, firstStart));
	}

	// 2. segments 之间的 gap
	for (let i = 0; i < segments.length - 1; i++) {
		const gapStart = Math.round((segments[i].end ?? 0) * 1000);
		const gapEnd = Math.round((segments[i + 1].start ?? 0) * 1000);
		const gap = gapEnd - gapStart;
		if (gap > thresholdMs) {
			regions.push(buildSilenceRegion(gapStart, gapEnd));
		}
	}

	// 3. 结尾静音
	if (totalDurationMs > 0) {
		const lastEnd = Math.round((segments[segments.length - 1].end ?? 0) * 1000);
		if (totalDurationMs - lastEnd > thresholdMs) {
			regions.push(buildSilenceRegion(lastEnd, totalDurationMs));
		}
	}

	const totalSilenceMs = regions.reduce((sum, r) => sum + r.durationMs, 0);
	const savingsPercent =
		totalDurationMs > 0 ? Math.round((totalSilenceMs / totalDurationMs) * 100) : 0;

	return { totalDurationMs, totalSilenceMs, silenceRegions: regions, savingsPercent };
}

function buildSilenceRegion(startMs: number, endMs: number): SilenceRegion {
	return {
		id: `silence-${startMs}-${endMs}`,
		startMs,
		endMs,
		durationMs: endMs - startMs,
	};
}

/**
 * 把 silence regions 转成 SRT 时间戳格式 (用户可复制到剪辑工具)
 */
export function silenceRegionsToSrt(regions: SilenceRegion[]): string {
	return regions
		.map((r, i) => {
			const start = formatSrtTime(r.startMs);
			const end = formatSrtTime(r.endMs);
			return `${i + 1}\n${start} --> ${end}\n[Silence ${r.durationMs}ms]\n`;
		})
		.join("\n");
}

function formatSrtTime(ms: number): string {
	const h = Math.floor(ms / 3_600_000);
	const m = Math.floor((ms % 3_600_000) / 60_000);
	const s = Math.floor((ms % 60_000) / 1000);
	const tail = ms % 1000;
	return `${pad(h)}:${pad(m)}:${pad(s)},${pad3(tail)}`;
}

function pad(n: number): string {
	return n.toString().padStart(2, "0");
}

function pad3(n: number): string {
	return n.toString().padStart(3, "0");
}
