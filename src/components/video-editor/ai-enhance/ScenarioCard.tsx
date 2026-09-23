/**
 * Kliq — AI 增强场景卡片 (§57-2)
 *
 * 单个场景的展示 + 选中态。视觉沿用 §213 极简风:
 *   - 6px / 10px 圆角
 *   - 1px #1c1c1c 边框
 *   - 唯一 accent = #22c55e 绿点 (active 状态)
 *   - 120-160ms cubic-bezier 过渡
 *   - inline style (不引入 Tailwind/shadcn, 沿 §54)
 */

import { ArrowRight, Check } from "@phosphor-icons/react";
import { type CSSProperties, memo, type ReactNode, useCallback } from "react";
import { SCENARIO_TEMPLATES, type ScenarioTemplate } from "@/lib/presets";

export type ScenarioCardProps = {
	readonly scenario: ScenarioTemplate;
	readonly active?: boolean;
	readonly onSelect: (id: ScenarioTemplate["id"]) => void;
};

const ACCENT = "#22c55e";
const RADIUS = 8;
const FONT_MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';
const FONT_SANS =
	'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Inter", "Noto Sans SC", sans-serif';

export const ScenarioCard = memo(function ScenarioCard({
	scenario,
	active = false,
	onSelect,
}: ScenarioCardProps): ReactNode {
	const handleClick = useCallback(() => {
		onSelect(scenario.id);
	}, [onSelect, scenario.id]);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				onSelect(scenario.id);
			}
		},
		[onSelect, scenario.id],
	);

	const containerStyle: CSSProperties = {
		position: "relative",
		display: "flex",
		flexDirection: "column",
		gap: "10px",
		padding: "20px 22px",
		borderRadius: RADIUS + "px",
		border: "1px solid " + (active ? "#0a0a0a" : "#e4e4e7"),
		backgroundColor: active ? "#fafafa" : "#ffffff",
		cursor: "pointer",
		transition: "all 160ms cubic-bezier(0.16, 1, 0.3, 1)",
		outline: "none",
	};

	const dotStyle: CSSProperties = {
		position: "absolute",
		top: "12px",
		right: "12px",
		width: "8px",
		height: "8px",
		borderRadius: "999px",
		backgroundColor: active ? ACCENT : "transparent",
		transition: "background-color 160ms cubic-bezier(0.16, 1, 0.3, 1)",
	};

	const nameStyle: CSSProperties = {
		margin: 0,
		fontSize: "17px",
		fontWeight: 600,
		letterSpacing: "-0.02em",
		color: "#0a0a0a",
		fontFamily: FONT_SANS,
	};

	const nameEnStyle: CSSProperties = {
		margin: 0,
		fontSize: "12px",
		fontWeight: 500,
		color: "#a1a1aa",
		fontFamily: FONT_MONO,
		letterSpacing: "0.04em",
	};

	const descStyle: CSSProperties = {
		margin: "4px 0 0",
		fontSize: "13px",
		lineHeight: 1.5,
		color: "#52525b",
	};

	const metaStyle: CSSProperties = {
		display: "flex",
		flexWrap: "wrap",
		gap: "6px",
		marginTop: "4px",
	};

	const metaItemStyle: CSSProperties = {
		display: "inline-flex",
		alignItems: "center",
		padding: "2px 8px",
		fontSize: "11px",
		fontWeight: 500,
		color: "#52525b",
		backgroundColor: "#f4f4f5",
		borderRadius: "999px",
		fontFamily: FONT_MONO,
		letterSpacing: "0.02em",
	};

	const tagsWrapStyle: CSSProperties = {
		display: "flex",
		flexWrap: "wrap",
		gap: "4px",
		marginTop: "8px",
	};

	const tagStyle: CSSProperties = {
		padding: "2px 6px",
		fontSize: "10.5px",
		fontWeight: 500,
		color: "#0a0a0a",
		backgroundColor: active ? "#fef3c7" : "#f4f4f5",
		borderRadius: RADIUS - 4 + "px",
		fontFamily: FONT_MONO,
	};

	const footerStyle: CSSProperties = {
		display: "flex",
		alignItems: "center",
		justifyContent: "flex-end",
		gap: "4px",
		marginTop: "6px",
		fontSize: "12px",
		fontWeight: 500,
		color: active ? "#0a0a0a" : "#a1a1aa",
		fontFamily: FONT_MONO,
		transition: "color 160ms cubic-bezier(0.16, 1, 0.3, 1)",
	};

	const formatDuration = (ms?: number): string => {
		if (!ms) return "自由时长";
		const minutes = Math.round(ms / 60000);
		if (minutes >= 60) return (minutes / 60).toFixed(1) + "h 上限";
		return minutes + "min 上限";
	};

	const formatCrop = (crop: { width: number; height: number }): string => {
		return crop.width + " × " + crop.height;
	};

	return (
		<div
			role="button"
			tabIndex={0}
			aria-pressed={active}
			aria-label={scenario.name}
			data-scenario-card={scenario.id}
			data-active={active ? "true" : "false"}
			style={containerStyle}
			onClick={handleClick}
			onKeyDown={handleKeyDown}
		>
			<div style={dotStyle} aria-hidden />
			<h3 style={nameStyle}>{scenario.name}</h3>
			<p style={nameEnStyle}>{scenario.nameEn}</p>
			<p style={descStyle}>{scenario.description}</p>
			<div style={metaStyle}>
				<span style={metaItemStyle}>{formatCrop(scenario.recommendedCrop)}</span>
				<span style={metaItemStyle}>{scenario.recommendedFps}fps</span>
				<span style={metaItemStyle}>
					{formatDuration(scenario.recommendedMaxDurationMs)}
				</span>
			</div>
			<div style={tagsWrapStyle} aria-label="推荐 AI 功能">
				{scenario.features.map((feature) => (
					<span key={feature} style={tagStyle}>
						{feature}
					</span>
				))}
			</div>
			<div style={footerStyle}>
				{active ? (
					<>
						<Check size={12} weight="bold" />
						<span>已选 · 前往下方流程</span>
					</>
				) : (
					<>
						<span>选择此场景</span>
						<ArrowRight size={12} weight="bold" />
					</>
				)}
			</div>
		</div>
	);
});

export type ScenarioGridProps = {
	readonly activeId?: ScenarioTemplate["id"];
	readonly onSelect: (id: ScenarioTemplate["id"]) => void;
};

export const ScenarioGrid = memo(function ScenarioGrid({
	activeId,
	onSelect,
}: ScenarioGridProps): ReactNode {
	return (
		<div
			data-scenario-grid
			data-active={activeId ?? ""}
			style={{
				display: "grid",
				gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
				gap: "12px",
			}}
		>
			{Object.values(SCENARIO_TEMPLATES).map((scenario) => (
				<ScenarioCard
					key={scenario.id}
					scenario={scenario}
					active={scenario.id === activeId}
					onSelect={onSelect}
				/>
			))}
		</div>
	);
});
