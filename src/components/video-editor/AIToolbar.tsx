/**
 * 言镜 — AI 工具栏 (P0/P1 全部 AI 功能的统一 UI 入口)
 *
 * 把 P0 A1/A2/B1/B2/B3/C1/C2/C3/G1 + P1 A3/A4/A5/B4/B5/C4/C5/D1/E/F/G2/G3/G4
 * 全部功能汇总到一个组件, 用户在导出/录制前/录制后都可调用
 */

import { useState } from "react";


export type AIAction =
	| "transcribe"           // B1 OpenAI Whisper 转录
	| "bilingual-captions"   // B2 GPT-4 双语字幕
	| "ai-silence"           // A1 去静音段
	| "ai-fillers"           // A2 去填充词
	| "ai-speed"             // A3 智能加速
	| "ai-zoom"              // A4 自动取景
	| "ai-oneclick"          // A5 一键剪辑
	| "ai-chapters"          // C1 章节
	| "ai-summary"           // C2 摘要
	| "ai-titles"            // C3 标题
	| "ai-tags"              // C4 标签
	| "ai-social"            // C5 社媒文案
	| "ai-translate-multi"   // B4 多语言字幕
	| "ai-proofread"         // B5 字幕 AI 校对
	| "ai-semantic-search"   // D1 语义搜索
	| "ai-ui-polish";        // G4 UI 润色

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
	{ id: "transcribe", labelKey: "yanjing.ai.actions.transcribe", labelFallback: "AI 转录", group: "transcribe", icon: "🎙️", requiresFile: true },
	{ id: "bilingual-captions", labelKey: "yanjing.ai.actions.bilingual", labelFallback: "AI 双语字幕", group: "transcribe", icon: "🈳", requiresFile: true },
	{ id: "ai-translate-multi", labelKey: "yanjing.ai.actions.translateMulti", labelFallback: "AI 多语言字幕", group: "translate", icon: "🌐", requiresTranscript: true },
	{ id: "ai-proofread", labelKey: "yanjing.ai.actions.proofread", labelFallback: "AI 字幕校对", group: "translate", icon: "✅", requiresTranscript: true },

	{ id: "ai-silence", labelKey: "yanjing.ai.actions.silence", labelFallback: "AI 去静音", group: "edit", icon: "🔇", requiresFile: true },
	{ id: "ai-fillers", labelKey: "yanjing.ai.actions.fillers", labelFallback: "AI 去填充词", group: "edit", icon: "✂️", requiresFile: true },
	{ id: "ai-speed", labelKey: "yanjing.ai.actions.speed", labelFallback: "AI 智能加速", group: "edit", icon: "⚡", requiresFile: true },
	{ id: "ai-zoom", labelKey: "yanjing.ai.actions.zoom", labelFallback: "AI 自动取景", group: "edit", icon: "🔍", requiresFile: true },
	{ id: "ai-oneclick", labelKey: "yanjing.ai.actions.oneclick", labelFallback: "AI 一键剪辑", group: "edit", icon: "🎬", requiresFile: true },

	{ id: "ai-chapters", labelKey: "yanjing.ai.actions.chapters", labelFallback: "AI 章节", group: "generate", icon: "📑", requiresTranscript: true },
	{ id: "ai-summary", labelKey: "yanjing.ai.actions.summary", labelFallback: "AI 摘要", group: "generate", icon: "📝", requiresTranscript: true },
	{ id: "ai-titles", labelKey: "yanjing.ai.actions.titles", labelFallback: "AI 标题", group: "generate", icon: "✏️", requiresTranscript: true },
	{ id: "ai-tags", labelKey: "yanjing.ai.actions.tags", labelFallback: "AI 标签", group: "generate", icon: "🏷️", requiresTranscript: true },
	{ id: "ai-social", labelKey: "yanjing.ai.actions.social", labelFallback: "AI 社媒文案", group: "generate", icon: "📱", requiresTranscript: true },

	{ id: "ai-semantic-search", labelKey: "yanjing.ai.actions.search", labelFallback: "AI 语义搜索", group: "search", icon: "🔎", requiresTranscript: true },
	{ id: "ai-ui-polish", labelKey: "yanjing.ai.actions.uiPolish", labelFallback: "UI 润色", group: "search", icon: "✨" },
];

export type AIHotwordDomain =
	| "general" | "legal" | "medical" | "ecommerce" | "education"
	| "finance" | "gaming" | "tech" | "marketing";

export type AIToolbarProps = {
	selectedDomain: AIHotwordDomain;
	onDomainChange: (d: AIHotwordDomain) => void;
	availableDomains: AIHotwordDomain[];
	onAction: (action: AIAction) => void;
	busy?: AIAction | null;
	disabled?: boolean;
};

// DOMAIN_LABEL_KEYS removed (unused)

const DOMAIN_LABELS: Record<AIHotwordDomain, string> = {
	general: "通用", legal: "法律", medical: "医疗", ecommerce: "电商",
	education: "教育", finance: "金融", gaming: "游戏", tech: "技术", marketing: "营销",
};

export function AIToolbar({
	selectedDomain,
	onDomainChange,
	availableDomains,
	onAction,
	busy,
	disabled,
}: AIToolbarProps) {
	const [expanded, setExpanded] = useState(false);

	const groups = {
		transcribe: AI_ACTIONS.filter((a) => a.group === "transcribe"),
		edit: AI_ACTIONS.filter((a) => a.group === "edit"),
		generate: AI_ACTIONS.filter((a) => a.group === "generate"),
		translate: AI_ACTIONS.filter((a) => a.group === "translate"),
		search: AI_ACTIONS.filter((a) => a.group === "search"),
	};

	return (
		<div className="ai-toolbar" style={{ border: "1px solid var(--yanjing-border, #e5e5e5)", borderRadius: 8, padding: 12, marginTop: 12 }}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
				<div style={{ fontWeight: 600, fontSize: 14 }}>
					AI 增强
				</div>
				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
					style={{ fontSize: 12, padding: "2px 8px" }}
				>
					{expanded ? "收起" : "展开"}
				</button>
			</div>

			<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
				<label style={{ fontSize: 12, color: "#666" }}>热词:</label>
				<select
					value={selectedDomain}
					onChange={(e) => onDomainChange(e.target.value as AIHotwordDomain)}
					disabled={disabled}
					style={{ fontSize: 12, padding: "2px 6px", borderRadius: 4 }}
				>
					{availableDomains.map((d) => (
						<option key={d} value={d}>
							{DOMAIN_LABELS[d]}
						</option>
					))}
				</select>
			</div>

			{expanded && (
				<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
					{(Object.keys(groups) as Array<keyof typeof groups>).map((gKey) => (
						<div key={gKey}>
							<div style={{ fontSize: 11, color: "#888", marginBottom: 4, textTransform: "uppercase" }}>
								{gKey === "transcribe" ? "转录" : gKey === "edit" ? "剪辑" : gKey === "generate" ? "生成" : gKey === "translate" ? "翻译" : "其他"}
							</div>
							<div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
								{groups[gKey].map((action) => (
									<button
										key={action.id}
										type="button"
										onClick={() => onAction(action.id)}
										disabled={disabled || busy === action.id}
										style={{
											fontSize: 12,
											padding: "4px 10px",
											border: "1px solid #d4d4d4",
											borderRadius: 4,
											background: busy === action.id ? "#f5f5f5" : "white",
											cursor: disabled ? "not-allowed" : "pointer",
										}}
									>
										{action.icon} {action.labelFallback}
										{busy === action.id && " ⏳"}
									</button>
								))}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
