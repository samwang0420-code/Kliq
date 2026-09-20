/**
 * Kliq — AI 工具栏 (P0/P1 全部 AI 功能的统一 UI 入口)
 *
 * 把 P0 A1/A2/B1/B2/B3/C1/C2/C3/G1 + P1 A3/A4/A5/B4/B5/C4/C5/D1/E/F/G2/G3/G4
 * 全部功能汇总到一个组件, 用户在导出/录制前/录制后都可调用
 */

import { useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { useIsPro } from "@/hooks/useLicenseStatus";
import { actionRequiresPro } from "@/lib/license";
import { openAccountCenter } from "@/lib/proGate";

export type AIAction =
	| "transcribe" // B1 OpenAI Whisper 转录
	| "bilingual-captions" // B2 GPT-4 双语字幕
	| "ai-silence" // A1 去静音段
	| "ai-fillers" // A2 去填充词
	| "ai-speed" // A3 智能加速
	| "ai-zoom" // A4 自动取景
	| "ai-oneclick" // A5 一键剪辑
	| "ai-chapters" // C1 章节
	| "ai-summary" // C2 摘要
	| "ai-titles" // C3 标题
	| "ai-tags" // C4 标签
	| "ai-social" // C5 社媒文案
	| "ai-translate-multi" // B4 多语言字幕
	| "ai-proofread" // B5 字幕 AI 校对
	| "ai-semantic-search" // D1 语义搜索
	| "ai-ui-polish"; // G4 UI 润色

export type AIProvider = "openai" | "anthropic" | "deepseek";

export type AIActionDef = {
	id: AIAction;
	labelKey: string;
	labelFallback: string;
	group: "transcribe" | "edit" | "generate" | "translate" | "search";
	icon: string; // emoji 占位
	requiresFile?: boolean;
	requiresTranscript?: boolean;
};

export const AI_ACTIONS: AIActionDef[] = [
	{
		id: "transcribe",
		labelKey: "yanjing.ai.actions.transcribe",
		labelFallback: "AI Transcribe",
		group: "transcribe",
		icon: "🎙️",
		requiresFile: true,
	},
	{
		id: "bilingual-captions",
		labelKey: "yanjing.ai.actions.bilingual",
		labelFallback: "AI Bilingual Captions",
		group: "transcribe",
		icon: "🈳",
		requiresFile: true,
	},
	{
		id: "ai-translate-multi",
		labelKey: "yanjing.ai.actions.translateMulti",
		labelFallback: "AI Multi-language Captions",
		group: "translate",
		icon: "🌐",
		requiresTranscript: true,
	},
	{
		id: "ai-proofread",
		labelKey: "yanjing.ai.actions.proofread",
		labelFallback: "AI Caption Proofread",
		group: "translate",
		icon: "✅",
		requiresTranscript: true,
	},

	{
		id: "ai-silence",
		labelKey: "yanjing.ai.actions.silence",
		labelFallback: "AI Silence Removal",
		group: "edit",
		icon: "🔇",
		requiresFile: true,
	},
	{
		id: "ai-fillers",
		labelKey: "yanjing.ai.actions.fillers",
		labelFallback: "AI Filler Removal",
		group: "edit",
		icon: "✂️",
		requiresFile: true,
	},
	{
		id: "ai-speed",
		labelKey: "yanjing.ai.actions.speed",
		labelFallback: "AI Smart Speed",
		group: "edit",
		icon: "⚡",
		requiresFile: true,
	},
	{
		id: "ai-zoom",
		labelKey: "yanjing.ai.actions.zoom",
		labelFallback: "AI Auto Zoom",
		group: "edit",
		icon: "🔍",
		requiresFile: true,
	},
	{
		id: "ai-oneclick",
		labelKey: "yanjing.ai.actions.oneclick",
		labelFallback: "AI One-click Edit",
		group: "edit",
		icon: "🎬",
		requiresFile: true,
	},

	{
		id: "ai-chapters",
		labelKey: "yanjing.ai.actions.chapters",
		labelFallback: "AI Chapters",
		group: "generate",
		icon: "📑",
		requiresTranscript: true,
	},
	{
		id: "ai-summary",
		labelKey: "yanjing.ai.actions.summary",
		labelFallback: "AI Summary",
		group: "generate",
		icon: "📝",
		requiresTranscript: true,
	},
	{
		id: "ai-titles",
		labelKey: "yanjing.ai.actions.titles",
		labelFallback: "AI Titles",
		group: "generate",
		icon: "✏️",
		requiresTranscript: true,
	},
	{
		id: "ai-tags",
		labelKey: "yanjing.ai.actions.tags",
		labelFallback: "AI Tags",
		group: "generate",
		icon: "🏷️",
		requiresTranscript: true,
	},
	{
		id: "ai-social",
		labelKey: "yanjing.ai.actions.social",
		labelFallback: "AI Social Copy",
		group: "generate",
		icon: "📱",
		requiresTranscript: true,
	},

	{
		id: "ai-semantic-search",
		labelKey: "yanjing.ai.actions.search",
		labelFallback: "AI Semantic Search",
		group: "search",
		icon: "🔎",
		requiresTranscript: true,
	},
	{
		id: "ai-ui-polish",
		labelKey: "yanjing.ai.actions.uiPolish",
		labelFallback: "UI Polish",
		group: "search",
		icon: "✨",
	},
];

export type AIHotwordDomain =
	| "general"
	| "legal"
	| "medical"
	| "ecommerce"
	| "education"
	| "finance"
	| "gaming"
	| "tech"
	| "marketing";

export type AIToolbarProps = {
	selectedDomain: AIHotwordDomain;
	onDomainChange: (d: AIHotwordDomain) => void;
	availableDomains: AIHotwordDomain[];
	onAction: (action: AIAction) => void;
	busy?: AIAction | null;
	disabled?: boolean;
};

// DOMAIN_LABEL_KEYS removed (unused)

export function AIToolbar({
	selectedDomain,
	onDomainChange,
	availableDomains,
	onAction,
	busy,
	disabled,
}: AIToolbarProps) {
	const t = useScopedT("editor");
	const [expanded, setExpanded] = useState(false);
	const isPro = useIsPro();

	const groups = {
		transcribe: AI_ACTIONS.filter((a) => a.group === "transcribe"),
		edit: AI_ACTIONS.filter((a) => a.group === "edit"),
		generate: AI_ACTIONS.filter((a) => a.group === "generate"),
		translate: AI_ACTIONS.filter((a) => a.group === "translate"),
		search: AI_ACTIONS.filter((a) => a.group === "search"),
	};

	return (
		<div
			className="ai-toolbar"
			style={{
				border: "1px solid var(--kliq-border, #e5e5e5)",
				borderRadius: 8,
				padding: 12,
				marginTop: 12,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginBottom: 8,
				}}
			>
				<div style={{ fontWeight: 600, fontSize: 14 }}>{t("yanjing.ai.toolbarTitle")}</div>
				<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
					{/* 个人中心入口：未激活时也要能点进来激活 / 购买 */}
					<button
						type="button"
						onClick={() => openAccountCenter()}
						title={t("yanjing.ai.proEntryHint", "Manage license & Pro benefits")}
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 5,
							fontSize: 12,
							padding: "2px 9px",
							border: isPro ? "1px solid #22c55e66" : "1px solid #d4d4d4",
							borderRadius: 999,
							background: isPro ? "#22c55e14" : "white",
							color: isPro ? "#16a34a" : "#444",
							cursor: "pointer",
						}}
					>
						<span
							style={{
								width: 6,
								height: 6,
								borderRadius: 999,
								background: isPro ? "#22c55e" : "#a3a3a3",
							}}
						/>
						{t(
							isPro ? "yanjing.ai.proActive" : "yanjing.ai.proEntry",
							isPro ? "Pro" : "Pro / Account",
						)}
					</button>
					<button
						type="button"
						onClick={() => setExpanded(!expanded)}
						style={{ fontSize: 12, padding: "2px 8px" }}
					>
						{t(expanded ? "yanjing.ai.toolbarCollapse" : "yanjing.ai.toolbarExpand")}
					</button>
				</div>
			</div>

			<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
				<label style={{ fontSize: 12, color: "#666" }}>
					{t("yanjing.ai.toolbarHotwords")}
				</label>
				<select
					value={selectedDomain}
					onChange={(e) => onDomainChange(e.target.value as AIHotwordDomain)}
					disabled={disabled}
					style={{ fontSize: 12, padding: "2px 6px", borderRadius: 4 }}
				>
					{availableDomains.map((d) => (
						<option key={d} value={d}>
							{t(`yanjing.ai.domains.${d}`)}
						</option>
					))}
				</select>
			</div>

			{expanded && (
				<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
					{(Object.keys(groups) as Array<keyof typeof groups>).map((gKey) => (
						<div key={gKey}>
							<div
								style={{
									fontSize: 11,
									color: "#888",
									marginBottom: 4,
									textTransform: "uppercase",
								}}
							>
								{t(`yanjing.ai.groups.${gKey}`)}
							</div>
							<div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
								{groups[gKey].map((action) => {
									const gated = actionRequiresPro(action.id) && !isPro;
									return (
										<button
											key={action.id}
											type="button"
											onClick={() => onAction(action.id)}
											disabled={disabled || busy === action.id}
											title={
												gated
													? t("yanjing.ai.proLocked", "Pro feature")
													: undefined
											}
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: 5,
												fontSize: 12,
												padding: "4px 10px",
												border: gated
													? "1px dashed #d4d4d4"
													: "1px solid #d4d4d4",
												borderRadius: 4,
												background:
													busy === action.id ? "#f5f5f5" : "white",
												cursor: disabled ? "not-allowed" : "pointer",
											}}
										>
											{action.icon} {t(action.labelKey, action.labelFallback)}
											{busy === action.id && " ⏳"}
											{gated && (
												<span
													style={{
														fontSize: 9,
														fontWeight: 700,
														letterSpacing: 0.4,
														padding: "1px 5px",
														borderRadius: 999,
														background: "#f5f5f5",
														color: "#8a8a8a",
														border: "1px solid #e2e2e2",
													}}
												>
													{t("yanjing.ai.proBadge", "PRO")}
												</span>
											)}
										</button>
									);
								})}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
