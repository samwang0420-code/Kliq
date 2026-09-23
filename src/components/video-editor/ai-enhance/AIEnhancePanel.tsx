/**
 * Kliq — AI 增强主面板 (§57-2)
 *
 * 对比豆包/WorkBuddy: 触发任何一个 AI 动作, 用户看到的是
 *   1) 一个场景选择 (直播回放 / 教学 / 演示 / 面试 / 销售 / ...),
 *      每个场景已经预配好推荐的 AI actions + 热词域 + 切幅
 *   2) 推荐流程时间轴, 按顺序自动执行 (Step 1, 2, 3 ...)
 *   3) 实时进度条 + 取消按钮
 * 这样用户从 "不知道用哪个 AI 按钮" 变成 "选场景 → 看进度 → 完成".
 *
 * 触发: 监听 window 自定义事件 `kliq:open-ai-enhance` (AiTab 派发, §57-1 立).
 *       也会监听 `kliq:open-ai-enhance-exit` 关闭. 不在普通 onClick 暴露,
 *       因为 §213 极简风里按钮都是次要操作, 主要靠事件总线.
 *
 * 数据流:
 *   user click scenario → setActiveScenarioId
 *   user click "开始流程" → 按顺序 runAction(action_i, params)
 *   busy 变化 → 更新 step.status
 *   step 全部 done → onDone (清状态 + 显示 "全部完成")
 *
 * 取消语义 (§160 in-flight guard 一致):
 *   cancel 只取消 UI 显示 + pending actions 队列; in-flight 请求等自然完成.
 *   这是 OpenAI/Anthropic 没有真正的 streaming cancel 协议的现实约束.
 *
 * 不引入 Tailwind/shadcn (沿 §54 inline style 规范)
 * 不引入 Zustand/Redux (沿 §W11-§W22 工具偏好, 单文件 React state 足够)
 */

import { ArrowRight, CircleNotch, Lightning, X } from "@phosphor-icons/react";
import {
	type CSSProperties,
	memo,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useAIActions } from "@/hooks/useAIActions";
import type { AIAction } from "@/lib/ai/action-inputs";
import { getScenarioTemplate, type ScenarioTemplate, type ScenarioTemplateId } from "@/lib/presets";
import { type FlowStep, type FlowStepStatus, FlowTimeline } from "./FlowTimeline";
import {
	AI_ACTION_BUSY_EVENT,
	type AIActionBusyDetail,
	dispatchAIActionBusy,
	isAIActionBusyDetail,
	resolveScenarioActions,
	shortLabelForAction as shortLabel,
} from "./helpers";
import { ProgressBar } from "./ProgressBar";
import { ScenarioGrid } from "./ScenarioCard";

// ---------- 样式常量 (沿 §213 极简风) ----------

const RADIUS = 12;
const FONT_MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';
const FONT_SANS =
	'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Inter", "Noto Sans SC", sans-serif';

// ---------- 内部 hook: 三步 wizard 状态 ----------

type Phase = "idle" | "scenario" | "flow" | "running" | "done" | "cancelled" | "error";

function useAIEnhanceState() {
	const [phase, setPhase] = useState<Phase>("idle");
	const [open, setOpen] = useState(false);
	const [activeScenarioId, setActiveScenarioId] = useState<ScenarioTemplateId | null>(null);
	const [steps, setSteps] = useState<FlowStep[]>([]);
	const [activeStepIndex, setActiveStepIndex] = useState<number>(-1);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const startedAtRef = useRef<number | null>(null);
	const [externalBusy, setExternalBusy] = useState<AIActionBusyDetail | null>(null);

	return {
		phase,
		setPhase,
		open,
		setOpen,
		activeScenarioId,
		setActiveScenarioId,
		steps,
		setSteps,
		activeStepIndex,
		setActiveStepIndex,
		errorMessage,
		setErrorMessage,
		externalBusy,
		setExternalBusy,
		startedAtRef,
	};
}

// ---------- 主组件 ----------

export type AIEnhancePanelProps = {
	readonly hotwordDomain?: import("@/lib/hotwords").HotwordDomain;
};

export const AIEnhancePanel = memo(function AIEnhancePanel({
	hotwordDomain = "general",
}: AIEnhancePanelProps): ReactNode {
	const state = useAIEnhanceState();
	const { runAction } = useAIActions({ hotwordDomain });

	// 监听 kliq:open-ai-enhance 事件 (AiTab 派发)
	useEffect(() => {
		const handler = () => {
			state.setOpen(true);
			state.setPhase((p) =>
				p === "idle" || p === "done" || p === "cancelled" || p === "error" ? "scenario" : p,
			);
		};
		window.addEventListener("kliq:open-ai-enhance", handler as EventListener);
		return () => window.removeEventListener("kliq:open-ai-enhance", handler as EventListener);
	}, []);

	// 监听 kliq:ai-action-busy (其他组件如 AIToolbar 在跑 AI 时通知本面板)
	// 自身 source='ai-enhance-panel' 跳过避免自循环 (§57-2 增强)
	useEffect(() => {
		const handler = (e: Event) => {
			const detail = (e as CustomEvent).detail;
			if (!isAIActionBusyDetail(detail)) return;
			if (detail.source === "ai-enhance-panel") return;
			state.setExternalBusy(detail.busy ? detail : null);
		};
		window.addEventListener(AI_ACTION_BUSY_EVENT, handler as EventListener);
		return () => window.removeEventListener(AI_ACTION_BUSY_EVENT, handler as EventListener);
	}, [state]);

	const handleClose = useCallback(() => {
		state.setOpen(false);
		// 不重置 scenario, 用户下次开还是同样的选择
	}, []);

	const handleSelectScenario = useCallback((id: ScenarioTemplateId) => {
		state.setActiveScenarioId(id);
		const template = getScenarioTemplate(id);
		const actions = resolveScenarioActions(template);
		const newSteps: FlowStep[] = actions.map((a) => ({
			id: a,
			label: shortLabel(a),
			status: "pending" as FlowStepStatus,
		}));
		state.setSteps(newSteps);
		state.setPhase("flow");
		state.setActiveStepIndex(-1);
		state.setErrorMessage(null);
	}, []);

	const handleStart = useCallback(async () => {
		if (state.steps.length === 0) return;
		state.setPhase("running");
		state.startedAtRef.current = performance.now();
		// 派发自身 busy=true (其他组件如 AIToolbar 可联动 UI 锁)
		dispatchAIActionBusy({
			action: (state.steps[0]?.id ?? "ai-summary") as AIAction,
			busy: true,
			source: "ai-enhance-panel",
		});
		for (let i = 0; i < state.steps.length; i += 1) {
			const step = state.steps[i];
			if (!step) continue;
			state.setActiveStepIndex(i);
			// mark running
			state.setSteps((prev) =>
				prev.map((s, idx) => (idx === i ? { ...s, status: "running", elapsedMs: 0 } : s)),
			);
			const startMs = performance.now();
			try {
				await runAction(step.id as AIAction);
				const elapsed = performance.now() - startMs;
				state.setSteps((prev) =>
					prev.map((s, idx) =>
						idx === i ? { ...s, status: "done", elapsedMs: elapsed } : s,
					),
				);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				state.setSteps((prev) =>
					prev.map((s, idx) => (idx === i ? { ...s, status: "error", error: msg } : s)),
				);
				state.setErrorMessage(msg);
				dispatchAIActionBusy({
					action: (state.steps[i]?.id ?? "ai-summary") as AIAction,
					busy: false,
					source: "ai-enhance-panel",
				});
				state.setPhase("error");
				return;
			}
		}
		dispatchAIActionBusy({
			action: (state.steps[state.steps.length - 1]?.id ?? "ai-summary") as AIAction,
			busy: false,
			source: "ai-enhance-panel",
		});
		state.setPhase("done");
	}, [runAction, state]);

	const handleCancel = useCallback(() => {
		state.setPhase("cancelled");
		state.setSteps((prev) =>
			prev.map((s, idx) =>
				idx >= state.activeStepIndex && state.activeStepIndex >= 0
					? { ...s, status: "cancelled" }
					: s,
			),
		);
		// 派发 busy=false (取消后清状态)
		dispatchAIActionBusy({
			action: (state.steps[state.activeStepIndex]?.id ?? "ai-summary") as AIAction,
			busy: false,
			source: "ai-enhance-panel",
		});
		// user 关闭 dialog 在 handleClose
	}, [state]);

	// ---------- Derived values ----------

	const activeScenario: ScenarioTemplate | null = useMemo(() => {
		return state.activeScenarioId ? getScenarioTemplate(state.activeScenarioId) : null;
	}, [state.activeScenarioId]);

	const percent = useMemo(() => {
		if (state.steps.length === 0) return 0;
		const completedCount = state.steps.filter((s) => s.status === "done").length;
		return (completedCount / state.steps.length) * 100;
	}, [state.steps]);

	const elapsedMs = useMemo(() => {
		if (!state.startedAtRef.current) return 0;
		return performance.now() - state.startedAtRef.current;
	}, [state.phase, state.activeStepIndex]);

	// ---------- Render ----------

	if (!state.open) return null;

	const overlayStyle: CSSProperties = {
		position: "fixed",
		inset: 0,
		backgroundColor: "rgba(10, 10, 10, 0.5)",
		zIndex: 100,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		padding: "20px",
	};

	const dialogStyle: CSSProperties = {
		position: "relative",
		width: "min(960px, 96vw)",
		maxHeight: "88vh",
		overflowY: "auto",
		backgroundColor: "#ffffff",
		borderRadius: RADIUS + "px",
		border: "1px solid #0a0a0a",
		padding: "32px 36px",
		display: "flex",
		flexDirection: "column",
		gap: "24px",
		boxShadow: "0 24px 80px rgba(0, 0, 0, 0.25)",
		fontFamily: FONT_SANS,
	};

	const headerRowStyle: CSSProperties = {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: "16px",
	};

	const titleStyle: CSSProperties = {
		margin: 0,
		fontSize: "24px",
		fontWeight: 600,
		letterSpacing: "-0.02em",
		color: "#0a0a0a",
		display: "flex",
		alignItems: "center",
		gap: "8px",
	};

	const subStyle: CSSProperties = {
		margin: "4px 0 0",
		fontSize: "13px",
		color: "#a1a1aa",
	};

	const externalBusyStyle: CSSProperties = {
		display: "flex",
		alignItems: "center",
		gap: "10px",
		padding: "12px 16px",
		marginTop: "12px",
		background: "rgba(251, 191, 36, 0.08)",
		border: "1px solid #fcd34d",
		borderRadius: RADIUS,
		color: "#0a0a0a",
		fontSize: "13px",
		lineHeight: 1.4,
		fontFamily: FONT_SANS,
	};

	const externalBusyDotStyle: CSSProperties = {
		width: "8px",
		height: "8px",
		borderRadius: "50%",
		background: "#f59e0b",
		display: "inline-block",
		flexShrink: 0,
		animation: "ai-enhance-pulse 1.6s ease-in-out infinite",
	};

	const closeBtnStyle: CSSProperties = {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: "32px",
		height: "32px",
		borderRadius: "999px",
		backgroundColor: "#fafafa",
		border: "1px solid #e4e4e7",
		cursor: "pointer",
		color: "#0a0a0a",
	};

	const startBtnStyle: CSSProperties = {
		display: "inline-flex",
		alignItems: "center",
		gap: "8px",
		padding: "12px 24px",
		fontSize: "14px",
		fontWeight: 600,
		color: "#ffffff",
		backgroundColor: "#0a0a0a",
		border: "1px solid #0a0a0a",
		borderRadius: RADIUS + "px",
		cursor: "pointer",
		fontFamily: FONT_SANS,
		transition: "all 160ms cubic-bezier(0.16, 1, 0.3, 1)",
	};

	const resetBtnStyle: CSSProperties = {
		display: "inline-flex",
		alignItems: "center",
		gap: "8px",
		padding: "12px 24px",
		fontSize: "14px",
		fontWeight: 500,
		color: "#0a0a0a",
		backgroundColor: "#ffffff",
		border: "1px solid #0a0a0a",
		borderRadius: RADIUS + "px",
		cursor: "pointer",
		fontFamily: FONT_SANS,
	};

	return (
		<div
			data-ai-enhance-overlay
			data-phase={state.phase}
			data-active-scenario={state.activeScenarioId ?? ""}
			style={overlayStyle}
			role="dialog"
			aria-label="AI 增强"
			aria-modal="true"
			// eslint-disable-next-line react/forbid-dom-props
			onClick={(event) => {
				if (event.target === event.currentTarget) handleClose();
			}}
		>
			<div data-ai-enhance-dialog style={dialogStyle}>
				<div style={headerRowStyle}>
					<div>
						<h2 style={titleStyle}>
							<Lightning size={22} weight="bold" color="#22c55e" />
							<span>AI 增强</span>
						</h2>
						<p style={subStyle}>
							{state.phase === "scenario" && "选个场景, AI 自动配好推荐动作 + 热词"}
							{state.phase === "flow" &&
								activeScenario &&
								"推荐 " +
									activeScenario.features.length +
									" 个动作, 按顺序自动执行"}
							{state.phase === "running" && "AI 正在处理…"}
							{state.phase === "done" && "全部完成 · 视频/标题/标签/摘要都已就绪"}
							{state.phase === "cancelled" && "已取消 (在跑的请求会自然完成)"}
							{state.phase === "error" && "出错了, 可重试或换个场景"}
						</p>
					</div>
					<button
						type="button"
						onClick={handleClose}
						aria-label="关闭"
						style={closeBtnStyle}
					>
						<X size={14} weight="bold" />
					</button>
				</div>

				{state.externalBusy && (
					<div
						data-ai-enhance-external-busy
						role="status"
						aria-live="polite"
						style={externalBusyStyle}
					>
						<span style={externalBusyDotStyle} aria-hidden="true" />
						<span>
							其他位置正在跑 AI: {state.externalBusy.action}
							{state.externalBusy.source === "ai-toolbar" && " (来自工具栏)"}
						</span>
					</div>
				)}

				{state.phase === "scenario" && (
					<div data-ai-enhance-step-scenario>
						<ScenarioGrid
							onSelect={handleSelectScenario}
							activeId={state.activeScenarioId ?? undefined}
						/>
					</div>
				)}

				{(state.phase === "flow" || state.phase === "idle") && (
					<div
						data-ai-enhance-step-flow
						style={{ display: "flex", flexDirection: "column", gap: "16px" }}
					>
						{activeScenario && (
							<p
								style={{
									margin: 0,
									fontSize: "12px",
									color: "#52525b",
									fontFamily: FONT_MONO,
								}}
							>
								{activeScenario.name} ({activeScenario.nameEn}) ·{" "}
								{activeScenario.recommendedHotwordDomain} 热词
							</p>
						)}
						<FlowTimeline steps={state.steps} />
						<div
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "flex-end",
								gap: "10px",
							}}
						>
							<button type="button" onClick={handleClose} style={resetBtnStyle}>
								换个场景
							</button>
							<button
								type="button"
								data-ai-enhance-start
								onClick={handleStart}
								disabled={state.steps.length === 0}
								style={{
									...startBtnStyle,
									opacity: state.steps.length === 0 ? 0.4 : 1,
									cursor: state.steps.length === 0 ? "not-allowed" : "pointer",
								}}
							>
								开始流程
								<ArrowRight size={14} weight="bold" />
							</button>
						</div>
					</div>
				)}

				{(state.phase === "running" ||
					state.phase === "done" ||
					state.phase === "cancelled" ||
					state.phase === "error") && (
					<div
						data-ai-enhance-step-running
						style={{ display: "flex", flexDirection: "column", gap: "16px" }}
					>
						<FlowTimeline steps={state.steps} />
						{state.phase === "running" && state.activeStepIndex >= 0 && (
							<ProgressBar
								currentStep={state.activeStepIndex}
								totalSteps={state.steps.length}
								percent={percent}
								elapsedMs={elapsedMs}
								runningStepLabel={state.steps[state.activeStepIndex]?.label}
								onCancel={handleCancel}
								cancelLabel="取消"
							/>
						)}
						{state.phase === "done" && (
							<div
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									padding: "14px 18px",
									borderRadius: RADIUS + "px",
									border: "1px solid #22c55e",
									backgroundColor: "#f0fdf4",
								}}
							>
								<p
									style={{
										margin: 0,
										fontSize: "14px",
										fontWeight: 600,
										color: "#0a0a0a",
									}}
								>
									✓ 全部完成 · {state.steps.length} 步, 用时{" "}
									{Math.floor(elapsedMs / 1000)}s
								</p>
								<button type="button" onClick={handleClose} style={resetBtnStyle}>
									关闭
								</button>
							</div>
						)}
						{state.phase === "cancelled" && (
							<div
								style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}
							>
								<button type="button" onClick={handleClose} style={resetBtnStyle}>
									关闭
								</button>
								<button
									type="button"
									onClick={() => {
										state.setPhase("flow");
										state.setSteps((prev) =>
											prev.map((s) =>
												s.status === "cancelled"
													? { ...s, status: "pending" as FlowStepStatus }
													: s,
											),
										);
									}}
									style={startBtnStyle}
								>
									<CircleNotch size={14} weight="bold" />
									继续未完成的步骤
								</button>
							</div>
						)}
						{state.phase === "error" && (
							<div
								style={{
									padding: "14px 18px",
									borderRadius: RADIUS + "px",
									border: "1px solid #dc2626",
									backgroundColor: "#fef2f2",
								}}
							>
								<p
									style={{
										margin: "0 0 8px",
										fontSize: "14px",
										fontWeight: 600,
										color: "#dc2626",
									}}
								>
									失败 · {state.errorMessage}
								</p>
								<div
									style={{
										display: "flex",
										gap: "10px",
										justifyContent: "flex-end",
									}}
								>
									<button
										type="button"
										onClick={handleClose}
										style={resetBtnStyle}
									>
										关闭
									</button>
									<button
										type="button"
										onClick={handleStart}
										style={startBtnStyle}
									>
										重试
									</button>
								</div>
							</div>
						)}
					</div>
				)}
			</div>

			{/* keyframe style 注入: spin 仅给 CircleNotch 用 */}
			<style
				dangerouslySetInnerHTML={{
					__html: "@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }",
				}}
			/>
		</div>
	);
});

export default AIEnhancePanel;
