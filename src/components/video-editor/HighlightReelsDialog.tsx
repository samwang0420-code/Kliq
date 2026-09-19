/**
 * 言镜 — AI Highlight Reels Dialog (P2 §18 真新功能 UI)
 *
 * 触发: 用户在 AIToolbar 选 "AI Highlight Reels"。
 * 流程:
 *   1. 显示进度 + 3 个抽样"预热"窗口 (用户立刻看到算法在工作)
 *   2. 计算完后: show timeline + highlight list (按 score 排序)
 *   3. 用户点任一 highlight → seek 到那个窗口 (preview)
 *   4. 用户选 1+ highlights → "Insert in Timeline" / "Export Reel"
 *
 * 设计原则:
 *  - 不要阻塞主线程的 progress UI (即使算法慢,进度条实时动)
 *  - 0 LLM API 调用 — 完全离线 (符合 §18 护城河 + localOnly flag in AIToolbar)
 *  - 全 i18n (useScopedT("editor"))
 */

import { useCallback, useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { analyzeVideo, type Highlight } from "@/lib/ai/highlight-reels";

export type HighlightReelsDialogProps = {
	videoUrl: string | null;
	videoDuration: number; // seconds, shown in header
	isOpen: boolean;
	onClose: () => void;
	onSeek?: (time: number) => void;
	onExportReel?: (highlight: Highlight) => void;
};

type Phase = "idle" | "loading" | "analyzing" | "done" | "error";

export function HighlightReelsDialog({
	videoUrl,
	videoDuration,
	isOpen,
	onClose,
	onSeek,
	onExportReel,
}: HighlightReelsDialogProps) {
	const t = useScopedT("editor");

	const [phase, setPhase] = useState<Phase>("idle");
	const [progress, setProgress] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [highlights, setHighlights] = useState<Highlight[]>([]);
	const [selectedId, setSelectedId] = useState<number | null>(null);

	const runAnalysis = useCallback(async () => {
		if (!videoUrl) return;
		setPhase("loading");
		setProgress(0);
		setError(null);
		setHighlights([]);
		setSelectedId(null);

		try {
			setPhase("analyzing");
			const result = await analyzeVideo(videoUrl, {
				count: 5,
				minLen: 15,
				maxLen: 45,
				onProgress: setProgress,
			});
			setHighlights(result);
			setPhase("done");
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setPhase("error");
		}
	}, [videoUrl]);

	useEffect(() => {
		if (!isOpen) {
			// Reset on close
			setPhase("idle");
			setProgress(0);
			setError(null);
			setHighlights([]);
			setSelectedId(null);
		}
	}, [isOpen]);

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
			<div
				className="bg-background border border-foreground/10 rounded-lg shadow-lg w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col"
				role="dialog"
				aria-labelledby="highlight-reels-title"
			>
				{/* Header */}
				<div className="px-6 py-4 border-b border-foreground/10 flex items-center justify-between">
					<div>
						<h2 id="highlight-reels-title" className="text-lg font-semibold text-foreground">
							🌟 {t("yanjing.ai.highlightReels.title", "AI Highlight Reels")}
						</h2>
						<p className="text-xs text-muted-foreground mt-1">
							{t(
								"yanjing.ai.highlightReels.subtitle",
								"Find the most engaging moments automatically (visual + audio, fully on-device).",
							)}
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="text-muted-foreground hover:text-foreground transition-colors"
						aria-label={t("common.close", "Close")}
					>
						✕
					</button>
				</div>

				{/* Body */}
				<div className="px-6 py-5 flex-1 overflow-y-auto">
					{phase === "idle" && (
						<div className="space-y-4 text-center">
							<p className="text-sm text-muted-foreground">
								{t(
									"yanjing.ai.highlightReels.idlePrompt",
									`Click run to analyze ${videoDuration.toFixed(0)}s of video.`,
								)}
							</p>
							<button
								type="button"
								onClick={runAnalysis}
								className="px-5 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
							>
								▶ {t("yanjing.ai.highlightReels.run", "Run Analysis")}
							</button>
						</div>
					)}

					{(phase === "loading" || phase === "analyzing") && (
						<div className="space-y-3">
							<div className="w-full bg-foreground/10 rounded-full h-2 overflow-hidden">
								<div
									className="h-full bg-primary transition-all duration-200"
									style={{ width: `${Math.round(progress * 100)}%` }}
								/>
							</div>
							<p className="text-xs text-muted-foreground text-center">
								{phase === "loading"
									? t("yanjing.ai.highlightReels.loading", "Loading video...")
									: t(
											"yanjing.ai.highlightReels.analyzing",
											"Analyzing visual energy + audio peaks...",
										)}{" "}
								{Math.round(progress * 100)}%
							</p>
						</div>
					)}

					{phase === "error" && (
						<div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
							<p className="font-medium">
								{t("yanjing.ai.highlightReels.error", "Failed to analyze video")}
							</p>
							<p className="text-xs mt-1 text-destructive/80">{error}</p>
							<button
								type="button"
								onClick={runAnalysis}
								className="mt-3 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
							>
								{t("yanjing.ai.highlightReels.retry", "Retry")}
							</button>
						</div>
					)}

					{phase === "done" && (
						<div className="space-y-3">
							{highlights.length === 0 ? (
								<p className="text-sm text-muted-foreground text-center py-4">
									{t(
										"yanjing.ai.highlightReels.empty",
										"No highlights detected (video may be too static). Try adjusting options.",
									)}
								</p>
							) : (
								<ul className="space-y-2">
									{highlights.map((h) => (
										<li
											key={h.id}
											className={`flex items-center justify-between p-3 rounded-md border transition-colors cursor-pointer ${
												selectedId === h.id
													? "border-primary bg-primary/5"
													: "border-foreground/10 hover:border-foreground/30"
											}`}
											onClick={() => {
												setSelectedId(h.id);
												onSeek?.(h.peakTime);
											}}
											data-testid={`highlight-row-${h.id}`}
										>
											<div className="flex items-center gap-3">
												<span className="text-2xl">🌟</span>
												<div>
													<div className="text-sm font-medium text-foreground">
														{t(
															"yanjing.ai.highlightReels.rowTitle",
															"Highlight #{{id}}",
														).replace("{{id}}", String(h.id + 1))}
													</div>
													<div className="text-xs text-muted-foreground mt-0.5">
														{h.start.toFixed(0)}s – {h.end.toFixed(0)}s ·{" "}
														{Math.round(h.score * 100)}%
													</div>
												</div>
											</div>
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													onExportReel?.(h);
												}}
												className="text-xs px-3 py-1.5 rounded-md bg-foreground/5 hover:bg-foreground/10 text-foreground"
											>
												{t("yanjing.ai.highlightReels.exportReel", "Export Reel")}
											</button>
										</li>
									))}
								</ul>
							)}
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="px-6 py-3 border-t border-foreground/10 flex justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-1.5 rounded-md text-sm text-foreground hover:bg-foreground/5"
					>
						{t("common.close", "Close")}
					</button>
				</div>
			</div>
		</div>
	);
}
