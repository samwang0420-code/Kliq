/**
 * Kliq — AI 结果面板
 *
 * ⚠️ 历史缺陷（本次修复）：`useAIActions` 返回的 `results` 在**全仓没有任何消费方**。
 * 用户点「AI 摘要」，请求真的发出去了、结果也真的回来了，但界面上什么都不显示 ——
 * 于是所有 Pro 权益在体感上等同于「没开发」。本组件是这批结果的唯一展示面。
 *
 * 另一个关键作用：把转写文本**回填到工具栏输入区**，把
 * 「转写 → 摘要 / 章节 / 标题 / 标签 / 社媒文案 / 校对 / 多语言」这条链真正接上。
 */

import { ArrowsClockwise, Copy } from "@phosphor-icons/react";
import { useScopedT } from "@/contexts/I18nContext";
import type { AIResultsState } from "@/hooks/useAIActions";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export type AIResultPanelProps = {
	results: AIResultsState;
	/** 把转写文本回填到工具栏的输入区（接通下游文本类动作） */
	onUseTranscript: (text: string) => void;
	className?: string;
};

/** 秒 → mm:ss */
function formatClock(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
	const total = Math.round(seconds);
	const mm = String(Math.floor(total / 60)).padStart(2, "0");
	const ss = String(total % 60).padStart(2, "0");
	return `${mm}:${ss}`;
}

function Section({
	title,
	action,
	children,
}: {
	title: string;
	action?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className="rounded-md border border-border bg-background/60 p-2.5">
			<div className="mb-1.5 flex items-center justify-between gap-2">
				<span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
					{title}
				</span>
				{action}
			</div>
			{children}
		</div>
	);
}

function CopyButton({ text }: { text: string }) {
	const t = useScopedT("editor");
	return (
		<button
			type="button"
			onClick={() => {
				void navigator.clipboard
					.writeText(text)
					.then(() => toast.success(t("yanjing.ai.copied", "Copied")))
					.catch(() => toast.error(t("yanjing.ai.copy", "Copy")));
			}}
			className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
		>
			<Copy size={11} />
			{t("yanjing.ai.copy", "Copy")}
		</button>
	);
}

/** 没有结果时不占位 */
export function AIResultPanel({ results, onUseTranscript, className }: AIResultPanelProps) {
	const t = useScopedT("editor");
	const label = (key: string, fallback: string) => t(`yanjing.ai.actions.${key}`, fallback);

	const hasAnything = Boolean(
		results.transcribeResult ||
			results.bilingualCaptions?.length ||
			results.translations ||
			results.proofreadIssues?.length ||
			results.silenceRegions?.length ||
			results.fillerRegions?.length ||
			results.speedRegions?.length ||
			results.zoomRegions?.length ||
			results.chapters?.length ||
			results.summary ||
			results.titles?.length ||
			results.tags?.length ||
			results.socialCopy ||
			results.searchHits ||
			results.uiPolishResult,
	);

	if (!hasAnything) return null;

	const countLabel = (count: number) => t("yanjing.ai.itemCount", "{{count}} item(s)", { count });

	return (
		<div className={cn("mt-3 space-y-2 rounded-lg border border-border p-3", className)}>
			<div className="text-sm font-semibold tracking-tight">
				{t("yanjing.ai.resultsTitle", "AI Results")}
			</div>

			{results.transcribeResult && (
				<Section
					title={label("transcribe", "AI Transcribe")}
					action={
						<div className="flex items-center gap-1">
							<button
								type="button"
								onClick={() =>
									onUseTranscript(results.transcribeResult?.text ?? "")
								}
								className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-green-600 transition-colors hover:bg-green-500/10"
							>
								<ArrowsClockwise size={11} />
								{t("yanjing.ai.useTranscript", "Use as input")}
							</button>
							<CopyButton text={results.transcribeResult.text} />
						</div>
					}
				>
					<p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed">
						{results.transcribeResult.text}
					</p>
					{results.transcribeResult.segments && (
						<p className="mt-1 text-[11px] text-muted-foreground">
							{countLabel(results.transcribeResult.segments.length)}
						</p>
					)}
				</Section>
			)}

			{results.bilingualCaptions && results.bilingualCaptions.length > 0 && (
				<Section
					title={label("bilingual", "AI Bilingual Captions")}
					action={
						<CopyButton text={JSON.stringify(results.bilingualCaptions, null, 2)} />
					}
				>
					<ul className="max-h-40 space-y-1 overflow-y-auto">
						{results.bilingualCaptions.slice(0, 20).map((caption) => (
							<li key={caption.id} className="text-xs leading-relaxed">
								<span className="mr-1.5 font-mono text-[11px] text-muted-foreground">
									{formatClock(caption.start)}
								</span>
								<span>{caption.sourceText}</span>
								<span className="ml-1 text-muted-foreground">
									→ {caption.targetText}
								</span>
							</li>
						))}
					</ul>
				</Section>
			)}

			{results.translations && (
				<Section title={label("translateMulti", "AI Multi-language Captions")}>
					<ul className="space-y-0.5">
						{Object.entries(results.translations).map(([lang, segments]) => (
							<li
								key={lang}
								className="flex justify-between gap-3 text-xs text-muted-foreground"
							>
								<span className="font-mono">{lang}</span>
								<span>{countLabel(segments.length)}</span>
							</li>
						))}
					</ul>
				</Section>
			)}

			{results.proofreadIssues && results.proofreadIssues.length > 0 && (
				<Section
					title={label("proofread", "AI Caption Proofread")}
					action={<CopyButton text={JSON.stringify(results.proofreadIssues, null, 2)} />}
				>
					<ul className="max-h-40 space-y-1 overflow-y-auto">
						{results.proofreadIssues.slice(0, 20).map((issue) => (
							<li key={issue.captionId} className="text-xs leading-relaxed">
								<span className="mr-1 text-muted-foreground">{issue.severity}</span>
								<span className="line-through">{issue.originalText}</span>
								<span className="mx-1 text-green-600">→</span>
								<span>{issue.suggestedText}</span>
							</li>
						))}
					</ul>
				</Section>
			)}

			{(
				[
					["silence", results.silenceRegions],
					["fillers", results.fillerRegions],
					["speed", results.speedRegions],
					["zoom", results.zoomRegions],
				] as const
			).map(([key, regions]) =>
				regions && regions.length > 0 ? (
					<Section key={key} title={label(key, key)}>
						<p className="text-xs text-muted-foreground">
							{countLabel(regions.length)}
						</p>
					</Section>
				) : null,
			)}

			{results.chapters && results.chapters.length > 0 && (
				<Section
					title={label("chapters", "AI Chapters")}
					action={<CopyButton text={JSON.stringify(results.chapters, null, 2)} />}
				>
					<ul className="space-y-1">
						{results.chapters.map((chapter) => (
							<li key={chapter.id} className="flex gap-2 text-xs leading-relaxed">
								<span className="shrink-0 font-mono text-[11px] text-muted-foreground">
									{formatClock(chapter.start)}–{formatClock(chapter.end)}
								</span>
								<span>{chapter.title}</span>
							</li>
						))}
					</ul>
				</Section>
			)}

			{results.summary && (
				<Section
					title={label("summary", "AI Summary")}
					action={<CopyButton text={results.summary.brief} />}
				>
					<p className="whitespace-pre-wrap text-xs leading-relaxed">
						{results.summary.brief}
					</p>
					{results.summary.highlights.length > 0 && (
						<ul className="mt-1.5 list-disc space-y-0.5 pl-4">
							{results.summary.highlights.map((highlight) => (
								<li key={highlight} className="text-xs leading-relaxed">
									{highlight}
								</li>
							))}
						</ul>
					)}
				</Section>
			)}

			{results.titles && results.titles.length > 0 && (
				<Section
					title={label("titles", "AI Titles")}
					action={<CopyButton text={results.titles.map((t2) => t2.title).join("\n")} />}
				>
					<ul className="space-y-0.5">
						{results.titles.map((candidate) => (
							<li
								key={`${candidate.title}-${candidate.style}`}
								className="flex gap-2 text-xs leading-relaxed"
							>
								<span className="shrink-0 text-[11px] text-muted-foreground">
									{candidate.style}
								</span>
								<span>{candidate.title}</span>
							</li>
						))}
					</ul>
				</Section>
			)}

			{results.tags && results.tags.length > 0 && (
				<Section
					title={label("tags", "AI Tags")}
					action={<CopyButton text={results.tags.join(", ")} />}
				>
					<div className="flex flex-wrap gap-1">
						{results.tags.map((tag) => (
							<span
								key={tag}
								className="rounded-full border border-border px-2 py-0.5 text-[11px]"
							>
								{tag}
							</span>
						))}
					</div>
				</Section>
			)}

			{results.socialCopy && (
				<Section
					title={label("social", "AI Social Copy")}
					action={<CopyButton text={Object.values(results.socialCopy).join("\n\n")} />}
				>
					<dl className="space-y-1.5">
						{Object.entries(results.socialCopy).map(([platform, copy]) => (
							<div key={platform}>
								<dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
									{platform}
								</dt>
								<dd className="whitespace-pre-wrap text-xs leading-relaxed">
									{copy}
								</dd>
							</div>
						))}
					</dl>
				</Section>
			)}

			{results.searchHits && (
				<Section title={label("search", "AI Semantic Search")}>
					{results.searchHits.length === 0 ? (
						<p className="text-xs text-muted-foreground">
							{t("yanjing.ai.noResults", "No matches")}
						</p>
					) : (
						<ul className="space-y-1">
							{results.searchHits.map((hit) => (
								<li
									key={`${hit.transcriptId}-${hit.startMs}-${hit.endMs}`}
									className="text-xs leading-relaxed"
								>
									<span className="mr-2 font-mono text-[11px] text-muted-foreground">
										{formatClock(hit.startMs / 1000)}
									</span>
									<span>{hit.text}</span>
									<span className="ml-2 text-[11px] text-muted-foreground">
										{t("yanjing.ai.scoreLabel", "score")} {hit.score.toFixed(2)}
									</span>
								</li>
							))}
						</ul>
					)}
				</Section>
			)}

			{results.uiPolishResult && (
				<Section
					title={label("uiPolish", "UI Polish")}
					action={<CopyButton text={results.uiPolishResult} />}
				>
					<p className="whitespace-pre-wrap text-xs leading-relaxed">
						{results.uiPolishResult}
					</p>
				</Section>
			)}
		</div>
	);
}

export default AIResultPanel;
