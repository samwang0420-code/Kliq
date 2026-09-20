/**
 * Kliq — AI Actions Hook (P0/P1 全部 AI 调用的统一调度)
 */

import { useCallback, useState } from "react";
import type { AIAction } from "@/components/video-editor/AIToolbar";
import { type BilingualCaption, generateBilingualCaptions } from "@/lib/ai/bilingual-captions";
import {
	proofreadCaptions,
	SUPPORTED_LANGUAGES,
	type TargetLanguage,
	translateToMultipleLanguages,
} from "@/lib/ai/caption-polish";
import {
	type Chapter,
	generateChapters,
	generateSocialCopy,
	generateSummary,
	generateTags,
	generateTitles,
	type SocialCopy,
	type Summary,
	type TitleCandidate,
} from "@/lib/ai/content-gen";
import { detectFillerRegions, type FillerRegion } from "@/lib/ai/filler-removal";
import {
	type TranscribeResult,
	type TranscribeSegment,
	transcribeWithWhisper,
} from "@/lib/ai/openai-client";
import { type SearchHit, semanticSearch } from "@/lib/ai/semantic-search";
import { detectSilenceRegions, type SilenceRegion } from "@/lib/ai/silence-removal";
import {
	detectSpeedRegions,
	detectZoomRegions,
	oneClickEdit,
	type SpeedRegion,
	type ZoomRegion,
} from "@/lib/ai/smart-edit";
import { polishUIText, polishUITextBatch } from "@/lib/ai/ui-polish";
import type { HotwordDomain } from "@/lib/hotwords";
import { canUseFeature, ProRequiredError, proFeatureForAction } from "@/lib/license";
import { requestProUpgrade } from "@/lib/proGate";

export type AIResultsState = {
	silenceRegions: SilenceRegion[] | null;
	fillerRegions: FillerRegion[] | null;
	speedRegions: SpeedRegion[] | null;
	zoomRegions: ZoomRegion[] | null;
	chapters: Chapter[] | null;
	summary: Summary | null;
	titles: TitleCandidate[] | null;
	tags: string[] | null;
	socialCopy: SocialCopy | null;
	bilingualCaptions: BilingualCaption[] | null;
	translations: Record<TargetLanguage, TranscribeSegment[]> | null;
	proofreadIssues: import("@/lib/ai/caption-polish").ProofreadIssue[] | null;
	transcribeResult: TranscribeResult | null;
	searchHits: SearchHit[] | null;
	uiPolishResult: string | null;
};

export type UseAIActionsOptions = {
	hotwordDomain: HotwordDomain;
	language?: string;
};

export function useAIActions(options: UseAIActionsOptions) {
	const [busy, setBusy] = useState<AIAction | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [results, setResults] = useState<AIResultsState>({
		silenceRegions: null,
		fillerRegions: null,
		speedRegions: null,
		zoomRegions: null,
		chapters: null,
		summary: null,
		titles: null,
		tags: null,
		socialCopy: null,
		bilingualCaptions: null,
		translations: null,
		proofreadIssues: null,
		transcribeResult: null,
		searchHits: null,
		uiPolishResult: null,
	});

	const runAction = useCallback(
		async (action: AIAction, params?: Record<string, unknown>) => {
			// ---- Pro 闸门 -------------------------------------------------------
			// 命中闸门的动作（见 license.ts → ACTION_TO_PRO_FEATURE）在未激活 Pro 时
			// 一律不执行：打开个人中心并抛出 ProRequiredError，由调用方静默处理。
			// 去静音 / 去填充词 / 智能加速 / 自动取景 不在映射表内，保持免费可用。
			const gateFeature = proFeatureForAction(action);
			if (gateFeature && !canUseFeature(gateFeature)) {
				requestProUpgrade(gateFeature);
				throw new ProRequiredError(gateFeature);
			}

			setBusy(action);
			setError(null);
			try {
				switch (action) {
					case "transcribe": {
						const file = params?.file as File | Blob;
						if (!file) throw new Error("需要提供 audio file");
						const r = await transcribeWithWhisper({
							audioFile: file,
							language: options.language ?? "zh",
							responseFormat: "verbose_json",
							hotwordDomain: options.hotwordDomain,
						});
						setResults((s) => ({ ...s, transcribeResult: r }));
						return r;
					}
					case "bilingual-captions": {
						const file = params?.file as File | Blob;
						if (!file) throw new Error("需要提供 audio file");
						const r = await generateBilingualCaptions(file, {
							hotwordDomain: options.hotwordDomain,
							sourceLanguage: options.language ?? "zh",
							targetLanguage: "en",
						});
						setResults((s) => ({ ...s, bilingualCaptions: r }));
						return r;
					}
					case "ai-silence": {
						const file = params?.file as File | Blob;
						if (!file) throw new Error("需要提供 audio file");
						const r = await detectSilenceRegions({
							audioFile: file,
							hotwordDomain: options.hotwordDomain,
							language: options.language ?? "zh",
							videoDurationMs: params?.durationMs as number | undefined,
						});
						setResults((s) => ({ ...s, silenceRegions: r.silenceRegions }));
						return r;
					}
					case "ai-fillers": {
						const file = params?.file as File | Blob;
						if (!file) throw new Error("需要提供 audio file");
						const r = await detectFillerRegions({
							audioFile: file,
							language: (options.language === "zh" ? "zh" : "en") as "zh" | "en",
							hotwordDomain: options.hotwordDomain,
						});
						setResults((s) => ({ ...s, fillerRegions: r.fillerRegions }));
						return r;
					}
					case "ai-speed": {
						const file = params?.file as File | Blob;
						if (!file) throw new Error("需要提供 audio file");
						const r = await detectSpeedRegions({
							audioFile: file,
							hotwordDomain: options.hotwordDomain,
							language: options.language ?? "zh",
						});
						setResults((s) => ({ ...s, speedRegions: r }));
						return r;
					}
					case "ai-zoom": {
						const file = params?.file as File | Blob;
						if (!file) throw new Error("需要提供 audio file");
						const r = await detectZoomRegions({
							audioFile: file,
							hotwordDomain: options.hotwordDomain,
							language: options.language ?? "zh",
						});
						setResults((s) => ({ ...s, zoomRegions: r }));
						return r;
					}
					case "ai-oneclick": {
						const file = params?.file as File | Blob;
						if (!file) throw new Error("需要提供 audio file");
						const r = await oneClickEdit({
							audioFile: file,
							hotwordDomain: options.hotwordDomain,
							language: options.language ?? "zh",
						});
						setResults((s) => ({
							...s,
							speedRegions: r.speedRegions,
							zoomRegions: r.zoomRegions,
						}));
						return r;
					}
					case "ai-chapters": {
						const transcript = params?.transcript as string;
						const duration = params?.durationMs as number;
						if (!transcript) throw new Error("需要 transcript 文本");
						const r = await generateChapters(transcript, duration);
						setResults((s) => ({ ...s, chapters: r }));
						return r;
					}
					case "ai-summary": {
						const transcript = params?.transcript as string;
						if (!transcript) throw new Error("需要 transcript 文本");
						const r = await generateSummary(transcript);
						setResults((s) => ({ ...s, summary: r }));
						return r;
					}
					case "ai-titles": {
						const transcript = params?.transcript as string;
						if (!transcript) throw new Error("需要 transcript 文本");
						const r = await generateTitles(transcript);
						setResults((s) => ({ ...s, titles: r }));
						return r;
					}
					case "ai-tags": {
						const transcript = params?.transcript as string;
						if (!transcript) throw new Error("需要 transcript 文本");
						const r = await generateTags(transcript);
						setResults((s) => ({ ...s, tags: r }));
						return r;
					}
					case "ai-social": {
						const transcript = params?.transcript as string;
						if (!transcript) throw new Error("需要 transcript 文本");
						const r = await generateSocialCopy(transcript);
						setResults((s) => ({ ...s, socialCopy: r }));
						return r;
					}
					case "ai-translate-multi": {
						const segments = params?.segments as TranscribeSegment[];
						const targets = params?.targets as TargetLanguage[];
						if (!segments || !targets?.length)
							throw new Error("需要 segments 和 target 语言列表");
						const r = await translateToMultipleLanguages(segments, targets);
						setResults((s) => ({ ...s, translations: r }));
						return r;
					}
					case "ai-proofread": {
						const segments = params?.segments as TranscribeSegment[];
						if (!segments) throw new Error("需要 segments");
						const r = await proofreadCaptions({
							captions: segments,
							hotwordDomain: options.hotwordDomain,
						});
						setResults((s) => ({ ...s, proofreadIssues: r.issues }));
						return r;
					}
					case "ai-semantic-search": {
						const query = params?.query as string;
						if (!query) throw new Error("需要搜索 query");
						const r = await semanticSearch({ query, topK: 10 });
						setResults((s) => ({ ...s, searchHits: r }));
						return r;
					}
					case "ai-ui-polish": {
						const sourceText = params?.sourceText as string;
						const targetLanguage = (params?.targetLanguage as string) ?? "en";
						const mode = (params?.mode as "single" | "batch") ?? "single";
						if (!sourceText) throw new Error("需要 sourceText");
						const result =
							mode === "batch"
								? await polishUITextBatch({ sourceText, targetLanguage })
								: await polishUIText({ sourceText, targetLanguage });
						setResults((s) => ({ ...s, uiPolishResult: result.polishedText }));
						return result;
					}
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				setError(msg);
				throw err;
			} finally {
				setBusy(null);
			}
		},
		[options.hotwordDomain, options.language],
	);

	return { busy, error, results, runAction };
}

export { SUPPORTED_LANGUAGES };
