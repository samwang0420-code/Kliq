/**
 * 言镜 — AI 双语字幕工作流
 *
 * 编排 Whisper 转录 → GPT-4 翻译 → SRT/VTT 输出
 *
 * Stage 4 落地版本:
 * - 提供 generateBilingualCaptions(audioFile, options) 主入口
 * - 内部调用 OpenAI Whisper + GPT-4 (openai-client.ts)
 * - 输出标准 SRT/VTT 字幕格式 (Stage 5/Stage 6 可直接集成到 timeline)
 */

import { transcribeWithWhisper, translateCaptions } from "./openai-client";
import type { HotwordDomain } from "../hotwords";

export type BilingualOptions = {
	sourceLanguage?: string;
	targetLanguage: string;
	hotwordDomain?: HotwordDomain;
	translateProvider?: "openai" | "anthropic";
};

export type BilingualCaption = {
	id: number;
	start: number;
	end: number;
	sourceText: string;
	targetText: string;
};

/**
 * 主入口: 生成双语字幕
 */
export async function generateBilingualCaptions(
	audioFile: File | Blob,
	options: BilingualOptions,
): Promise<BilingualCaption[]> {
	// Step 1: Whisper 转录
	const whisperResult = await transcribeWithWhisper({
		audioFile,
		language: options.sourceLanguage,
		hotwordDomain: options.hotwordDomain,
		responseFormat: "verbose_json",
	});

	const segments = whisperResult.segments ?? [];
	if (segments.length === 0) return [];

	// Step 2: GPT-4 翻译
	const translatedSegments = await translateCaptions(
		segments,
		options.targetLanguage,
		options.sourceLanguage ?? "auto",
		options.hotwordDomain,
	);

	// Step 3: 合并原文 + 译文
	return segments.map((seg, idx) => ({
		id: seg.id,
		start: seg.start,
		end: seg.end,
		sourceText: seg.text,
		targetText: translatedSegments[idx]?.text ?? "",
	}));
}

/**
 * 字幕转 SRT 格式
 */
export function captionsToSrt(captions: BilingualCaption[]): string {
	return captions
		.map((cap, idx) => {
			const start = formatSrtTimestamp(cap.start);
			const end = formatSrtTimestamp(cap.end);
			const text = cap.targetText
				? `${cap.sourceText}\n${cap.targetText}`
				: cap.sourceText;
			return `${idx + 1}\n${start} --> ${end}\n${text}\n`;
		})
		.join("\n");
}

/**
 * 字幕转 VTT 格式
 */
export function captionsToVtt(captions: BilingualCaption[]): string {
	const header = "WEBVTT\n\n";
	const body = captions
		.map((cap, idx) => {
			const start = formatVttTimestamp(cap.start);
			const end = formatVttTimestamp(cap.end);
			const text = cap.targetText
				? `${cap.sourceText}\n${cap.targetText}`
				: cap.sourceText;
			return `${idx + 1}\n${start} --> ${end}\n${text}\n`;
		})
		.join("\n");

	return header + body;
}

function formatSrtTimestamp(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	const ms = Math.floor((seconds % 1) * 1000);
	return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

function formatVttTimestamp(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	const ms = Math.floor((seconds % 1) * 1000);
	return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`;
}

function pad(n: number, width: number): string {
	return String(n).padStart(width, "0");
}

/**
 * 导出字幕到文件 (下载)
 */
export function downloadCaptions(content: string, filename: string, mimeType = "text/plain"): void {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}
