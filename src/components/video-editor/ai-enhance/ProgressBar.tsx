/**
 * Kliq — AI 增强实时进度条 (§57-2)
 *
 * 显示当前 running step + 整体进度 (0-100) + 取消按钮.
 * 视觉沿 §213 极简风:
 *   - 8px 圆角
 *   - 黑底 4px 进度条 (JetBrains Mono 11px 数字)
 *   - 取消按钮白底 1px 边框 (触发放 cancelCustomEvent)
 *
 * 取消按钮不真中断 LLM 请求 (OpenAI streaming 必须等下个 token 才能中断),
 * 只是 UI 立即隐藏面板 + 让 AIEnhancePanel 进入 "cancel_pending" 状态,
 * 等 in-flight 请求自然完成 / 超时. 这与 §160 invoke in-flight guard 一致.
 */

import { CircleNotch, X } from "@phosphor-icons/react";
import { type CSSProperties, memo, type ReactNode } from "react";

export type ProgressBarProps = {
	readonly currentStep: number;
	readonly totalSteps: number;
	readonly percent: number;
	readonly elapsedMs: number;
	readonly estimatedTotalMs?: number;
	readonly runningStepLabel?: string;
	readonly onCancel?: () => void;
	readonly cancelLabel?: string;
};

const ACCENT = "#22c55e";
const RADIUS = 8;
const FONT_MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';

function formatElapsed(ms: number): string {
	if (ms < 1000) return Math.floor(ms / 100) / 10 + "s";
	const sec = Math.floor(ms / 1000);
	if (sec < 60) return sec + "s";
	const min = Math.floor(sec / 60);
	const remain = sec % 60;
	return min + "m" + (remain < 10 ? "0" : "") + remain + "s";
}

function formatRemain(ms: number): string {
	if (ms <= 0) return "完成";
	const sec = Math.max(1, Math.floor(ms / 1000));
	if (sec < 60) return sec + "s";
	const min = Math.floor(sec / 60);
	const remain = sec % 60;
	return min + "m" + (remain < 10 ? "0" : "") + remain + "s";
}

export const ProgressBar = memo(function ProgressBar({
	currentStep,
	totalSteps,
	percent,
	elapsedMs,
	estimatedTotalMs,
	runningStepLabel,
	onCancel,
	cancelLabel = "取消",
}: ProgressBarProps): ReactNode {
	const wrapStyle: CSSProperties = {
		display: "flex",
		flexDirection: "column",
		gap: "10px",
		padding: "16px 18px",
		borderRadius: RADIUS + "px",
		border: "1px solid #e4e4e7",
		backgroundColor: "#ffffff",
	};

	const headerRowStyle: CSSProperties = {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: "12px",
	};

	const labelStyle: CSSProperties = {
		margin: 0,
		fontSize: "13px",
		fontWeight: 600,
		color: "#0a0a0a",
		display: "flex",
		alignItems: "center",
		gap: "8px",
	};

	const sublabelStyle: CSSProperties = {
		margin: 0,
		fontSize: "11px",
		color: "#a1a1aa",
		fontFamily: FONT_MONO,
	};

	const percentStyle: CSSProperties = {
		margin: 0,
		fontSize: "16px",
		fontWeight: 700,
		color: "#0a0a0a",
		fontFamily: FONT_MONO,
		letterSpacing: "-0.02em",
		minWidth: "48px",
		textAlign: "right",
	};

	const trackWrapStyle: CSSProperties = {
		position: "relative",
		width: "100%",
		height: "4px",
		backgroundColor: "#f4f4f5",
		borderRadius: "999px",
		overflow: "hidden",
	};

	const fillStyle: CSSProperties = {
		width: Math.min(100, Math.max(0, percent)) + "%",
		height: "100%",
		backgroundColor: ACCENT,
		transition: "width 280ms cubic-bezier(0.16, 1, 0.3, 1)",
		borderRadius: "999px",
	};

	const footerRowStyle: CSSProperties = {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: "12px",
	};

	const elapsedStyle: CSSProperties = {
		margin: 0,
		fontSize: "11px",
		color: "#52525b",
		fontFamily: FONT_MONO,
	};

	const cancelBtnStyle: CSSProperties = {
		display: "inline-flex",
		alignItems: "center",
		gap: "4px",
		padding: "4px 10px",
		fontSize: "11px",
		fontWeight: 500,
		fontFamily: FONT_MONO,
		color: "#0a0a0a",
		backgroundColor: "#ffffff",
		border: "1px solid #0a0a0a",
		borderRadius: RADIUS - 2 + "px",
		cursor: "pointer",
		transition: "all 160ms cubic-bezier(0.16, 1, 0.3, 1)",
	};

	const clampedPercent = Math.min(100, Math.max(0, percent));

	return (
		<div
			data-progress-bar
			data-percent={clampedPercent}
			data-step={currentStep}
			style={wrapStyle}
		>
			<div style={headerRowStyle}>
				<p style={labelStyle}>
					<CircleNotch
						size={14}
						weight="bold"
						color="#0a0a0a"
						style={{ animation: "spin 1s linear infinite" }}
					/>
					<span>{runningStepLabel ?? "运行中…"}</span>
				</p>
				<p style={percentStyle}>{clampedPercent.toFixed(0)}%</p>
			</div>

			<div style={trackWrapStyle}>
				<div data-progress-fill style={fillStyle} />
			</div>

			<div style={footerRowStyle}>
				<p style={elapsedStyle}>
					Step {Math.min(currentStep + 1, totalSteps)} / {totalSteps}
					{elapsedMs > 0 && " · " + formatElapsed(elapsedMs) + " 已用"}
					{estimatedTotalMs !== undefined &&
						estimatedTotalMs > elapsedMs &&
						" · 预计剩余 " + formatRemain(estimatedTotalMs - elapsedMs)}
				</p>
				{onCancel && (
					<button
						type="button"
						data-progress-cancel
						onClick={onCancel}
						style={cancelBtnStyle}
					>
						<X size={11} weight="bold" />
						<span>{cancelLabel}</span>
					</button>
				)}
			</div>

			<p style={sublabelStyle} aria-hidden>
				runningStepLabel?.length === 0 ? "" : "AI 处理中, 长时间可点取消"
			</p>
		</div>
	);
});
