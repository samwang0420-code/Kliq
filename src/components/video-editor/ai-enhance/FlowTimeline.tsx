/**
 * Kliq — AI 增强流程时间轴 (§57-2)
 *
 * 把场景推荐的 features 数组映射到 useAIActions 的 16 actions,
 * 按顺序渲染流程图。状态机: pending → running → done | error | cancelled.
 *
 * 设计要点:
 *   - 左侧步骤编号 (JetBrains Mono 11px 灰)
 *   - 中间连线 (running/done 段绿, error 段红, cancelled 段灰)
 *   - 右侧 label + 状态 (Step 完成显示时间戳, 失败显示 retry)
 *   - 点单个 step 可视化"运行中" (Loading ring + 取消)
 *
 * 状态 prop 来自父组件 AIEnhancePanel (它监听 kliq:ai-action-busy 自定义事件),
 * 不在本组件直接调 useAIActions, 保持组件纯净可独立测试.
 */

import { Check, CircleNotch, Prohibit, Warning } from "@phosphor-icons/react";
import { type CSSProperties, memo, type ReactNode } from "react";

export type FlowStepStatus = "pending" | "running" | "done" | "error" | "cancelled";

export type FlowStep = {
	readonly id: string;
	readonly label: string;
	readonly status: FlowStepStatus;
	readonly elapsedMs?: number;
	readonly error?: string;
};

export type FlowTimelineProps = {
	readonly steps: ReadonlyArray<FlowStep>;
	readonly onStepClick?: (stepId: string) => void;
};

const ACCENT = "#22c55e";
const RADIUS = 8;
const FONT_MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';

function formatElapsed(ms?: number): string {
	if (!ms || ms < 1000) return "<1s";
	const sec = Math.floor(ms / 1000);
	if (sec < 60) return sec + "s";
	const min = Math.floor(sec / 60);
	const remain = sec % 60;
	return min + "m" + remain + "s";
}

function statusColor(status: FlowStepStatus, active: boolean): { fg: string; bg: string } {
	switch (status) {
		case "running":
			return { fg: "#ffffff", bg: active ? "#0a0a0a" : "#52525b" };
		case "done":
			return { fg: "#ffffff", bg: ACCENT };
		case "error":
			return { fg: "#ffffff", bg: "#dc2626" };
		case "cancelled":
			return { fg: "#52525b", bg: "#e4e4e7" };
		case "pending":
		default:
			return { fg: "#a1a1aa", bg: "#f4f4f5" };
	}
}

export const FlowStepRow = memo(function FlowStepRow({
	step,
	index,
	isLast,
	onClick,
}: {
	step: FlowStep;
	index: number;
	isLast: boolean;
	onClick?: (stepId: string) => void;
}): ReactNode {
	const colors = statusColor(step.status, true);

	const wrapperStyle: CSSProperties = {
		display: "flex",
		alignItems: "flex-start",
		gap: "12px",
		padding: "10px 0",
		cursor: onClick ? "pointer" : "default",
	};

	const indexStyle: CSSProperties = {
		minWidth: "28px",
		fontSize: "11px",
		fontWeight: 600,
		fontFamily: FONT_MONO,
		color: "#a1a1aa",
		paddingTop: "4px",
		textAlign: "right",
	};

	const dotColStyle: CSSProperties = {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		minWidth: "20px",
	};

	const dotStyle: CSSProperties = {
		width: "20px",
		height: "20px",
		borderRadius: "999px",
		backgroundColor: colors.bg,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
		transition: "background-color 160ms cubic-bezier(0.16, 1, 0.3, 1)",
	};

	const lineStyle: CSSProperties = {
		width: "2px",
		flex: 1,
		minHeight: "16px",
		marginTop: "4px",
		backgroundColor:
			step.status === "done" ? ACCENT : step.status === "error" ? "#dc2626" : "#e4e4e7",
	};

	const contentColStyle: CSSProperties = {
		display: "flex",
		flexDirection: "column",
		gap: "2px",
		flex: 1,
		paddingTop: "1px",
	};

	const labelStyle: CSSProperties = {
		margin: 0,
		fontSize: "14px",
		fontWeight: step.status === "running" ? 600 : 500,
		color: step.status === "pending" ? "#a1a1aa" : "#0a0a0a",
		fontFamily:
			'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Inter", "Noto Sans SC", sans-serif',
	};

	const metaStyle: CSSProperties = {
		margin: 0,
		fontSize: "11px",
		fontFamily: FONT_MONO,
		color: step.status === "error" ? "#dc2626" : "#a1a1aa",
	};

	return (
		<div
			data-flow-step={step.id}
			data-flow-status={step.status}
			data-flow-index={index}
			style={wrapperStyle}
			onClick={() => onClick?.(step.id)}
			onKeyDown={(event) => {
				if (onClick && (event.key === "Enter" || event.key === " ")) {
					event.preventDefault();
					onClick(step.id);
				}
			}}
		>
			<span style={indexStyle}>0{index + 1}</span>
			<div style={dotColStyle}>
				<div style={dotStyle}>
					{step.status === "running" ? (
						<CircleNotch size={12} weight="bold" color="#ffffff" />
					) : step.status === "done" ? (
						<Check size={12} weight="bold" color="#ffffff" />
					) : step.status === "error" ? (
						<Warning size={12} weight="bold" color="#ffffff" />
					) : step.status === "cancelled" ? (
						<Prohibit size={12} weight="bold" color="#52525b" />
					) : null}
				</div>
				{!isLast && <div style={lineStyle} />}
			</div>
			<div style={contentColStyle}>
				<p style={labelStyle}>{step.label}</p>
				{step.status === "running" && step.elapsedMs !== undefined && (
					<p style={metaStyle}>{formatElapsed(step.elapsedMs)} · 运行中…</p>
				)}
				{step.status === "done" && step.elapsedMs !== undefined && (
					<p style={metaStyle}>{formatElapsed(step.elapsedMs)}</p>
				)}
				{step.status === "error" && <p style={metaStyle}>{step.error ?? "失败,可重试"}</p>}
				{step.status === "cancelled" && <p style={metaStyle}>已取消</p>}
			</div>
		</div>
	);
});

export const FlowTimeline = memo(function FlowTimeline({
	steps,
	onStepClick,
}: FlowTimelineProps): ReactNode {
	const wrapStyle: CSSProperties = {
		display: "flex",
		flexDirection: "column",
		padding: "12px 14px",
		borderRadius: RADIUS + "px",
		border: "1px solid #e4e4e7",
		backgroundColor: "#ffffff",
	};

	return (
		<div data-flow-timeline data-step-count={steps.length} style={wrapStyle}>
			{steps.length === 0 && (
				<p
					style={{
						margin: 0,
						fontSize: "12px",
						color: "#a1a1aa",
						fontFamily: FONT_MONO,
					}}
				>
					暂无步骤 (请先选择场景)
				</p>
			)}
			{steps.map((step, index) => (
				<FlowStepRow
					key={step.id}
					step={step}
					index={index}
					isLast={index === steps.length - 1}
					onClick={onStepClick}
				/>
			))}
		</div>
	);
});
