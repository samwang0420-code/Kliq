/**
 * Kliq — AI 增强主面板 (§61 统一入口)
 *
 * 旧版痛点 (§58 用户反馈 + §61 拍板):
 *  - AI 增强 / AI 字幕 / 导出菜单里的 AI Enhance 三处入口重复, 用户不知道用哪个
 *  - 大 textarea 让用户"写提示词", 用户原话"我们设计好提示词, 封装好, 用户只要点按钮就行"
 *  - 5 个场景模板 + 一键增强 CTA, 概念复杂, 开发者也看不懂
 *
 * 新版设计 (§61 — 合并 AIToolbar.tsx 设计):
 *  - 居中大对话框 (沿 §58-1 §213 inline 极简风)
 *  - 顶部: Hotwords dropdown + Scenario dropdown (沿用 trash/AIToolbar.tsx 设计)
 *      选 Scenario → 自动切到推荐 Hotwords 域
 *  - 5 组按钮 (transcribe/edit/generate/translate/search) 直接点击执行
 *  - 进度: ProgressBar 显示当前 action + 百分比 + 取消按钮
 *  - query/sourceText 类按钮弹小输入框 (semantic-search / ui-polish)
 *  - **不显示 textarea prompt** (用户拍板)
 *  - **不显示 AI INPUTS 大块** (用户拍板)
 *
 * 不引入 Tailwind/shadcn (沿 §54 inline style 规范)
 */

import { CircleNotch, Sparkle, X } from "@phosphor-icons/react";
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
import {
	type AIInputState,
	EMPTY_AI_INPUTS,
	isAIActionReady,
	missingAIInputs,
} from "@/lib/ai/action-inputs";
import type { HotwordDomain } from "@/lib/hotwords";
import { actionRequiresPro } from "@/lib/license";
import { getScenarioTemplate, SCENARIO_TEMPLATES, type ScenarioTemplateId } from "@/lib/presets";
import { openAccountCenter } from "@/lib/proGate";
import {
	ACTION_LABEL_ZH,
	AI_ACTION_BUSY_EVENT,
	dispatchAIActionBusy,
	groupActionsByOrder,
	HOTWORD_DOMAINS,
	isAIActionBusyDetail,
} from "./helpers";
import { ProgressBar } from "./ProgressBar";

// ---------- §213 design tokens ----------

const COLORS = {
	black: "#0a0a0a",
	white: "#ffffff",
	bgPrimary: "#ffffff",
	bgSecondary: "#fafafa",
	bgTertiary: "#f4f4f5",
	border: "#e4e4e7",
	borderStrong: "#a1a1aa",
	textPrimary: "#0a0a0a",
	textSecondary: "#52525b",
	textMuted: "#a1a1aa",
	accent: "#22c55e",
	accentBg: "#22c55e1f",
	accentBorder: "#22c55e55",
	accentBgLight: "#22c55e0d",
	error: "#ef4444",
};

const RADIUS = 12;
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

const FONT_SANS =
	'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Inter", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';

const FONT_MONO = 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace';

// ---------- Phase state machine ----------

type Phase = "idle" | "running" | "done" | "error" | "cancelled";

type PendingInput =
	| { kind: "query"; actionId: "ai-semantic-search" }
	| { kind: "sourceText"; actionId: "ai-ui-polish" }
	| null;

const OVERLAY_STYLE: CSSProperties = {
	position: "fixed",
	inset: 0,
	background: "rgba(10, 10, 10, 0.45)",
	zIndex: 50,
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	padding: "20px",
};

const DIALOG_STYLE: CSSProperties = {
	background: COLORS.bgPrimary,
	borderRadius: `${RADIUS * 1.5}px`,
	border: `1px solid ${COLORS.border}`,
	boxShadow: "0 20px 60px rgba(10, 10, 10, 0.12), 0 4px 16px rgba(10, 10, 10, 0.04)",
	width: "100%",
	maxWidth: "640px",
	maxHeight: "88vh",
	display: "flex",
	flexDirection: "column",
	overflow: "hidden",
	fontFamily: FONT_SANS,
};

const HEADER_STYLE: CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	padding: "20px 24px 12px 24px",
	flexShrink: 0,
};

const TITLE_STYLE: CSSProperties = {
	margin: 0,
	fontSize: "16px",
	fontWeight: 600,
	letterSpacing: "-0.01em",
	color: COLORS.textPrimary,
	display: "flex",
	alignItems: "center",
	gap: "8px",
};

const CLOSE_BTN_STYLE: CSSProperties = {
	background: "transparent",
	border: `1px solid ${COLORS.border}`,
	borderRadius: "8px",
	width: "28px",
	height: "28px",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	cursor: "pointer",
	color: COLORS.textSecondary,
	transition: "all 140ms " + EASE,
	padding: 0,
};

const BODY_STYLE: CSSProperties = {
	padding: "0 24px 24px 24px",
	overflowY: "auto",
	display: "flex",
	flexDirection: "column",
	gap: "16px",
	flex: 1,
};

const LABEL_STYLE: CSSProperties = {
	margin: 0,
	fontSize: "11px",
	fontWeight: 600,
	letterSpacing: "0.04em",
	textTransform: "uppercase",
	color: COLORS.textMuted,
};

const SELECT_STYLE: CSSProperties = {
	background: COLORS.bgPrimary,
	border: `1px solid ${COLORS.border}`,
	borderRadius: "8px",
	padding: "6px 10px",
	fontSize: "12px",
	color: COLORS.textPrimary,
	fontFamily: "inherit",
	outline: "none",
	cursor: "pointer",
	transition: "all 140ms " + EASE,
};

const ROW_STYLE: CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "10px",
	flexWrap: "wrap",
};

const GROUP_TITLE_STYLE: CSSProperties = {
	margin: "0 0 6px 0",
	fontSize: "11px",
	fontWeight: 600,
	letterSpacing: "0.04em",
	textTransform: "uppercase",
	color: COLORS.textMuted,
	fontFamily: FONT_MONO,
};

const BUTTON_GROUP_STYLE: CSSProperties = {
	display: "flex",
	flexWrap: "wrap",
	gap: "6px",
};

function getActionButtonStyle(opts: {
	gated: boolean;
	notReady: boolean;
	isBusy: boolean;
}): CSSProperties {
	if (opts.isBusy) {
		return {
			display: "inline-flex",
			alignItems: "center",
			gap: "5px",
			borderRadius: "8px",
			border: `1px solid ${COLORS.borderStrong}`,
			background: COLORS.bgSecondary,
			padding: "6px 12px",
			fontSize: "12px",
			fontWeight: 500,
			color: COLORS.textPrimary,
			fontFamily: "inherit",
			cursor: "wait",
		};
	}
	if (opts.notReady) {
		return {
			display: "inline-flex",
			alignItems: "center",
			gap: "5px",
			borderRadius: "8px",
			border: `1px solid ${COLORS.border}`,
			background: COLORS.bgPrimary,
			padding: "6px 12px",
			fontSize: "12px",
			fontWeight: 500,
			color: COLORS.textMuted,
			fontFamily: "inherit",
			cursor: "not-allowed",
			opacity: 0.55,
		};
	}
	if (opts.gated) {
		return {
			display: "inline-flex",
			alignItems: "center",
			gap: "5px",
			borderRadius: "8px",
			border: `1px dashed ${COLORS.border}`,
			background: COLORS.bgPrimary,
			padding: "6px 12px",
			fontSize: "12px",
			fontWeight: 500,
			color: COLORS.textSecondary,
			fontFamily: "inherit",
			cursor: "pointer",
			transition: "all 140ms " + EASE,
		};
	}
	return {
		display: "inline-flex",
		alignItems: "center",
		gap: "5px",
		borderRadius: "8px",
		border: `1px solid ${COLORS.border}`,
		background: COLORS.bgPrimary,
		padding: "6px 12px",
		fontSize: "12px",
		fontWeight: 500,
		color: COLORS.textPrimary,
		fontFamily: "inherit",
		cursor: "pointer",
		transition: "all 140ms " + EASE,
	};
}

const PRO_BADGE_STYLE: CSSProperties = {
	borderRadius: "999px",
	border: `1px solid ${COLORS.border}`,
	background: COLORS.bgTertiary,
	padding: "1px 6px",
	fontSize: "9px",
	fontWeight: 700,
	letterSpacing: "0.06em",
	color: COLORS.textMuted,
	marginLeft: "2px",
};

const INPUT_OVERLAY_STYLE: CSSProperties = {
	position: "absolute",
	inset: 0,
	background: "rgba(10, 10, 10, 0.5)",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	borderRadius: `${RADIUS * 1.5}px`,
	padding: "24px",
	zIndex: 10,
};

const INPUT_CARD_STYLE: CSSProperties = {
	background: COLORS.bgPrimary,
	borderRadius: "12px",
	border: `1px solid ${COLORS.border}`,
	padding: "20px",
	display: "flex",
	flexDirection: "column",
	gap: "12px",
	width: "100%",
	maxWidth: "420px",
};

const INPUT_FIELD_STYLE: CSSProperties = {
	width: "100%",
	minHeight: "60px",
	padding: "10px 12px",
	borderRadius: "8px",
	border: `1px solid ${COLORS.border}`,
	background: COLORS.bgPrimary,
	color: COLORS.textPrimary,
	fontSize: "13px",
	lineHeight: 1.5,
	fontFamily: "inherit",
	resize: "vertical",
	outline: "none",
	boxSizing: "border-box",
};

// ---------- Helpers ----------

function titleForGroup(group: string): string {
	const map: Record<string, string> = {
		transcribe: "转录",
		edit: "编辑",
		generate: "生成",
		translate: "翻译",
		search: "搜索",
	};
	return map[group] ?? group;
}

// ---------- Component ----------

function AIEnhancePanelImpl(): ReactNode {
	const [open, setOpen] = useState(false);
	const [hotwordDomain, setHotwordDomain] = useState<HotwordDomain>("general");
	const [scenarioId, setScenarioId] = useState<ScenarioTemplateId | "">("");
	const [phase, setPhase] = useState<Phase>("idle");
	const [busy, setBusy] = useState<string | null>(null);
	const [progressPct, setProgressPct] = useState(0);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [pendingInput, setPendingInput] = useState<PendingInput>(null);
	const [inputDraft, setInputDraft] = useState("");
	const startedAtRef = useRef<number | null>(null);
	const cancelledRef = useRef<boolean>(false);

	// inputs 状态 — 用于判断按钮是否就绪
	// TODO(§61 后续): file / transcript / segments 实际接入 (从当前编辑器 project 拿)
	const [inputs] = useState<AIInputState>(EMPTY_AI_INPUTS);

	const { runAction, error: aiError } = useAIActions({ hotwordDomain });

	// 监听 open 事件
	useEffect(() => {
		if (typeof window === "undefined") return;
		const onOpen = () => {
			setOpen(true);
			setPhase("idle");
			setBusy(null);
			setErrorMessage(null);
			setProgressPct(0);
		};
		const onClose = () => {
			setOpen(false);
			setPendingInput(null);
			setInputDraft("");
		};
		window.addEventListener("kliq:open-ai-enhance", onOpen);
		window.addEventListener("kliq:open-ai-enhance-exit", onClose);
		return () => {
			window.removeEventListener("kliq:open-ai-enhance", onOpen);
			window.removeEventListener("kliq:open-ai-enhance-exit", onClose);
		};
	}, []);

	// 监听外部 busy 事件 (§57-2 增强)
	useEffect(() => {
		if (typeof window === "undefined") return;
		const onBusy = (event: Event) => {
			const ce = event as CustomEvent;
			if (!isAIActionBusyDetail(ce.detail)) return;
			if (ce.detail.source === "ai-enhance-panel") return;
			// 外部工具栏触发, 我们仅做感知, 不抢 UI
		};
		window.addEventListener(AI_ACTION_BUSY_EVENT, onBusy);
		return () => window.removeEventListener(AI_ACTION_BUSY_EVENT, onBusy);
	}, []);

	// Esc 关闭
	useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && phase !== "running" && !pendingInput) {
				setOpen(false);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open, phase, pendingInput]);

	const groups = useMemo(() => groupActionsByOrder(), []);

	const runDirectly = useCallback(
		async (actionId: string, extraParams: Record<string, unknown> = {}) => {
			cancelledRef.current = false;
			setPhase("running");
			setBusy(actionId);
			setProgressPct(0);
			setErrorMessage(null);
			startedAtRef.current = Date.now();

			dispatchAIActionBusy({
				action: actionId as never,
				busy: true,
				source: "ai-enhance-panel",
			});

			try {
				await runAction(
					actionId as never,
					{ hotwordDomain, ...extraParams } as Record<string, unknown>,
				);
				if (!cancelledRef.current) {
					setPhase("done");
					setProgressPct(100);
				}
			} catch (err) {
				setErrorMessage(err instanceof Error ? err.message : String(err));
				setPhase("error");
			} finally {
				dispatchAIActionBusy({
					action: actionId as never,
					busy: false,
					source: "ai-enhance-panel",
				});
				setBusy(null);
			}
		},
		[hotwordDomain, runAction],
	);

	const handleAction = useCallback(
		async (actionId: string) => {
			// semantic-search 需要 query → 弹输入框
			if (actionId === "ai-semantic-search") {
				setPendingInput({ kind: "query", actionId });
				setInputDraft("");
				return;
			}
			// ui-polish 需要 sourceText → 弹输入框
			if (actionId === "ai-ui-polish") {
				setPendingInput({ kind: "sourceText", actionId });
				setInputDraft("");
				return;
			}
			// 其余直接执行
			await runDirectly(actionId);
		},
		[runDirectly],
	);

	const handleSubmitInput = useCallback(() => {
		if (!pendingInput) return;
		const params: Record<string, unknown> =
			pendingInput.kind === "query"
				? { query: inputDraft.trim() }
				: { sourceText: inputDraft.trim() };
		const actionId = pendingInput.actionId;
		setPendingInput(null);
		setInputDraft("");
		void runDirectly(actionId, params);
	}, [pendingInput, inputDraft, runDirectly]);

	const handleCancelInput = useCallback(() => {
		setPendingInput(null);
		setInputDraft("");
	}, []);

	const handleCancel = useCallback(() => {
		cancelledRef.current = true;
		setPhase("cancelled");
	}, []);

	if (!open) return null;

	const runningStepLabel = busy ? (ACTION_LABEL_ZH[busy as never] ?? busy) : undefined;

	return (
		<div
			style={OVERLAY_STYLE}
			data-ai-enhance-overlay
			onMouseDown={(event) => {
				if (event.target === event.currentTarget && phase !== "running" && !pendingInput) {
					setOpen(false);
				}
			}}
		>
			<div
				data-ai-enhance-panel
				role="dialog"
				aria-modal="true"
				aria-label="AI 增强"
				style={DIALOG_STYLE}
			>
				<header style={HEADER_STYLE}>
					<h2 style={TITLE_STYLE}>
						<Sparkle size={16} weight="duotone" style={{ color: COLORS.accent }} />
						AI 增强
					</h2>
					<button
						type="button"
						onClick={() => setOpen(false)}
						disabled={phase === "running" || pendingInput !== null}
						aria-label="关闭"
						style={{
							...CLOSE_BTN_STYLE,
							...(phase === "running" || pendingInput !== null
								? { opacity: 0.4, cursor: "not-allowed" }
								: {}),
						}}
					>
						<X size={14} weight="bold" />
					</button>
				</header>

				<div style={BODY_STYLE}>
					{/* 顶部控制: Hotwords + Scenario dropdown */}
					<div style={ROW_STYLE}>
						<label
							htmlFor="kliq-ai-hotwords"
							style={{ ...LABEL_STYLE, ...{ textTransform: "none" } }}
						>
							热词域:
						</label>
						<select
							id="kliq-ai-hotwords"
							value={hotwordDomain}
							onChange={(event) =>
								setHotwordDomain(event.target.value as HotwordDomain)
							}
							disabled={phase === "running"}
							style={SELECT_STYLE}
							data-ai-enhance-hotwords
						>
							{HOTWORD_DOMAINS.map((d) => (
								<option key={d} value={d}>
									{d}
								</option>
							))}
						</select>

						<label
							htmlFor="kliq-ai-scenario"
							style={{ ...LABEL_STYLE, ...{ textTransform: "none" } }}
						>
							场景:
						</label>
						<select
							id="kliq-ai-scenario"
							value={scenarioId}
							onChange={(event) => {
								const next = event.target.value as ScenarioTemplateId | "";
								setScenarioId(next);
								if (next) {
									const tpl = getScenarioTemplate(next);
									setHotwordDomain(tpl.recommendedHotwordDomain);
								}
							}}
							disabled={phase === "running"}
							style={SELECT_STYLE}
							data-ai-enhance-scenario
						>
							<option value="">不选</option>
							{Object.values(SCENARIO_TEMPLATES).map((s) => (
								<option key={s.id} value={s.id}>
									{s.name}
								</option>
							))}
						</select>
					</div>

					{/* 5 组按钮 (transcribe / edit / generate / translate / search) */}
					{groups.map(({ group, actions }) => (
						<div key={group} data-ai-enhance-group={group}>
							<p style={GROUP_TITLE_STYLE}>{titleForGroup(group)}</p>
							<div style={BUTTON_GROUP_STYLE}>
								{actions.map((action) => {
									const isBusy = busy === action.id;
									const gated = actionRequiresPro(action.id);
									const missing = missingAIInputs(action.id, inputs);
									const notReady =
										missing.length > 0 && !isAIActionReady(action.id, inputs);
									const buttonStyle = getActionButtonStyle({
										gated,
										notReady,
										isBusy,
									});
									const ActionIcon = action.Icon;
									return (
										<button
											key={action.id}
											type="button"
											onClick={() => {
												if (gated) {
													void openAccountCenter();
													return;
												}
												void handleAction(action.id);
											}}
											disabled={isBusy}
											title={gated ? "Pro 功能" : action.labelFallback}
											style={buttonStyle}
											data-ai-enhance-action={action.id}
										>
											{isBusy ? (
												<CircleNotch
													size={12}
													weight="bold"
													className="animate-spin"
												/>
											) : (
												<ActionIcon size={12} weight="duotone" />
											)}
											{ACTION_LABEL_ZH[action.id] ?? action.labelFallback}
											{gated && <span style={PRO_BADGE_STYLE}>PRO</span>}
										</button>
									);
								})}
							</div>
						</div>
					))}

					{/* 进度条 */}
					{(phase === "running" ||
						phase === "done" ||
						phase === "error" ||
						phase === "cancelled") && (
						<div data-ai-enhance-progress>
							<ProgressBar
								currentStep={phase === "running" ? 1 : 1}
								totalSteps={1}
								percent={progressPct}
								elapsedMs={Date.now() - (startedAtRef.current ?? Date.now())}
								runningStepLabel={
									phase === "running" ? runningStepLabel : undefined
								}
								onCancel={handleCancel}
								cancelLabel="取消"
							/>
							{(phase === "error" || (aiError && phase !== "running")) && (
								<p
									style={{
										margin: "8px 0 0 0",
										fontSize: "12px",
										color: COLORS.error,
									}}
									data-ai-enhance-error
								>
									{errorMessage ?? aiError}
								</p>
							)}
						</div>
					)}

					{/* query / sourceText 输入弹窗 */}
					{pendingInput && (
						<div style={INPUT_OVERLAY_STYLE}>
							<div style={INPUT_CARD_STYLE}>
								<h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>
									{pendingInput.kind === "query" ? "搜索关键词" : "待润色文案"}
								</h3>
								<textarea
									autoFocus
									style={INPUT_FIELD_STYLE}
									placeholder={
										pendingInput.kind === "query"
											? "e.g. where did it go wrong"
											: "粘贴要润色的文案..."
									}
									value={inputDraft}
									onChange={(event) => setInputDraft(event.target.value)}
									rows={pendingInput.kind === "sourceText" ? 4 : 2}
									data-ai-enhance-input
								/>
								<div
									style={{
										display: "flex",
										gap: "8px",
										justifyContent: "flex-end",
									}}
								>
									<button
										type="button"
										onClick={handleCancelInput}
										style={{
											background: COLORS.bgPrimary,
											color: COLORS.textPrimary,
											border: `1px solid ${COLORS.border}`,
											borderRadius: "8px",
											padding: "6px 14px",
											fontSize: "12px",
											fontWeight: 500,
											cursor: "pointer",
											fontFamily: "inherit",
										}}
									>
										取消
									</button>
									<button
										type="button"
										onClick={handleSubmitInput}
										disabled={!inputDraft.trim()}
										style={{
											background: COLORS.black,
											color: COLORS.white,
											border: "none",
											borderRadius: "8px",
											padding: "6px 14px",
											fontSize: "12px",
											fontWeight: 500,
											cursor: inputDraft.trim() ? "pointer" : "not-allowed",
											opacity: inputDraft.trim() ? 1 : 0.5,
											fontFamily: "inherit",
										}}
									>
										执行
									</button>
								</div>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export const AIEnhancePanel = memo(AIEnhancePanelImpl);
export default AIEnhancePanel;
