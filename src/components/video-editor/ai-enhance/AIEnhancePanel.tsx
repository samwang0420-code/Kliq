/**
 * Kliq — AI 增强主面板 (§58-3 重设计: workbuddy 模式)
 *
 * 旧版痛点 (§57 §1.2 + §58 用户反馈):
 *  - 3 步 wizard: 选场景 → 看流程 → 看进度, 用户"看不懂怎么用"
 *  - 16 个 AI 按钮网格 (AIToolbar) 用户"根本不知道用哪个"
 *  - 跟豆包 / WorkBuddy 的"输入需求 → 一键增强"差太远
 *
 * 新版设计 (§58-3 — WorkBuddy 风格):
 *  - 居中大对话框 (沿 §58-1 §213 inline 极简风)
 *  - 顶部: 1 个大 textarea (输入"想对这个录屏做什么")
 *  - 中部: 5 个场景模板标签 (直播/教学/演示/面试/销售)
 *      点击模板 → 自动填充 textarea 模板 + 设定 activeTemplate
 *  - 主 CTA: "一键增强" (黑底白字大按钮)
 *  - 进度: 沿用 ProgressBar 显示当前 action + 百分比 + 取消按钮
 *  - 历史侧栏: 最近 10 次操作记录 (时间 + 模板 + 完成状态)
 *
 * 不引入 Tailwind/shadcn (沿 §54 inline style 规范)
 * 不引入 Zustand/Redux (沿 §W11-§W22 工具偏好)
 */

import { ArrowRight, CircleNotch, Lightning, Sparkle, X } from "@phosphor-icons/react";
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
import { getScenarioTemplate, SCENARIO_TEMPLATES, type ScenarioTemplateId } from "@/lib/presets";
import {
	ACTION_LABEL_ZH,
	AI_ACTION_BUSY_EVENT,
	dispatchAIActionBusy,
	isAIActionBusyDetail,
	resolveScenarioActions,
	shortLabelForAction,
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
};

const RADIUS = 12;
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

const FONT_SANS =
	'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Inter", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';

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
	fontSize: "14px",
	fontFamily: "inherit",
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

const TEXTAREA_STYLE: CSSProperties = {
	width: "100%",
	minHeight: "96px",
	maxHeight: "240px",
	padding: "12px 14px",
	borderRadius: "10px",
	border: `1px solid ${COLORS.border}`,
	background: COLORS.bgPrimary,
	color: COLORS.textPrimary,
	fontSize: "14px",
	lineHeight: 1.6,
	fontFamily: "inherit",
	resize: "vertical",
	outline: "none",
	transition: "all 140ms " + EASE,
	boxSizing: "border-box",
};

const TEMPLATE_ROW_STYLE: CSSProperties = {
	display: "flex",
	flexWrap: "wrap",
	gap: "8px",
};

function getTemplateChipStyle(active: boolean): CSSProperties {
	return {
		background: active ? COLORS.accentBgLight : COLORS.bgPrimary,
		border: `1px solid ${active ? COLORS.accentBorder : COLORS.border}`,
		borderRadius: "999px",
		padding: "6px 14px",
		fontSize: "12px",
		fontWeight: 500,
		color: active ? COLORS.textPrimary : COLORS.textSecondary,
		cursor: "pointer",
		display: "inline-flex",
		alignItems: "center",
		gap: "4px",
		transition: "all 140ms " + EASE,
		fontFamily: "inherit",
	};
}

const PRIMARY_CTA_STYLE: CSSProperties = {
	background: COLORS.black,
	color: COLORS.white,
	border: "none",
	borderRadius: "10px",
	padding: "14px 20px",
	fontSize: "14px",
	fontWeight: 600,
	cursor: "pointer",
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	gap: "8px",
	transition: "all 140ms " + EASE,
	fontFamily: "inherit",
	width: "100%",
};

const PRIMARY_CTA_DISABLED_STYLE: CSSProperties = {
	...PRIMARY_CTA_STYLE,
	background: COLORS.bgTertiary,
	color: COLORS.textMuted,
	cursor: "not-allowed",
};

const HISTORY_LIST_STYLE: CSSProperties = {
	listStyle: "none",
	margin: 0,
	padding: 0,
	display: "flex",
	flexDirection: "column",
	gap: "4px",
};

const HISTORY_ITEM_STYLE: CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "8px",
	padding: "8px 12px",
	borderRadius: "8px",
	background: COLORS.bgSecondary,
	fontSize: "12px",
	color: COLORS.textSecondary,
	lineHeight: 1.4,
};

const STATUS_DOT_DONE_STYLE: CSSProperties = {
	width: "6px",
	height: "6px",
	borderRadius: "999px",
	background: COLORS.textMuted,
	flexShrink: 0,
};

const STATUS_DOT_FAIL_STYLE: CSSProperties = {
	width: "6px",
	height: "6px",
	borderRadius: "999px",
	background: "#ef4444",
	flexShrink: 0,
};

// ---------- 类型 ----------

type Phase = "idle" | "running" | "done" | "cancelled" | "error";

type HistoryItem = {
	id: string;
	timestamp: number;
	scenarioName: string;
	actionCount: number;
	status: "done" | "cancelled" | "error";
	durationMs: number;
};

const HISTORY_LIMIT = 10;

function promptTemplateFor(scenario: ScenarioTemplateId): string {
	const map: Record<ScenarioTemplateId, string> = {
		liveStream: "把这段直播回放自动切成可发布的短视频片段,加上 AI 章节和吸引人的标题。",
		teaching: "把这段教学录屏生成课件摘要、章节大纲和 SEO 标签,方便学员复习。",
		demo: "把这段产品演示录屏去填充词 + 智能加速,突出关键操作步骤,生成章节。",
		interview: "把这段面试/对话加上双语字幕,识别问答对,生成摘要。",
		sales: "把这段销售通话识别客户异议和关键需求,加上双语字幕,生成摘要。",
	};
	return map[scenario];
}

function AIEnhancePanelImpl(): ReactNode {
	const [open, setOpen] = useState(false);
	const [prompt, setPrompt] = useState("");
	const [activeScenarioId, setActiveScenarioId] = useState<ScenarioTemplateId | null>(null);
	const [phase, setPhase] = useState<Phase>("idle");
	const [currentActionIndex, setCurrentActionIndex] = useState<number>(-1);
	const [totalActions, setTotalActions] = useState<number>(0);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [history, setHistory] = useState<HistoryItem[]>([]);
	const startedAtRef = useRef<number | null>(null);
	const cancelledRef = useRef<boolean>(false);

	const { runAction } = useAIActions({
		hotwordDomain: (activeScenarioId
			? getScenarioTemplate(activeScenarioId).recommendedHotwordDomain
			: "general") as never,
	});

	useEffect(() => {
		if (typeof window === "undefined") return;
		const onOpen = () => setOpen(true);
		const onClose = () => {
			setOpen(false);
			setPhase("idle");
			setCurrentActionIndex(-1);
			setTotalActions(0);
			setErrorMessage(null);
			cancelledRef.current = false;
		};
		window.addEventListener("kliq:open-ai-enhance", onOpen);
		window.addEventListener("kliq:open-ai-enhance-exit", onClose);
		return () => {
			window.removeEventListener("kliq:open-ai-enhance", onOpen);
			window.removeEventListener("kliq:open-ai-enhance-exit", onClose);
		};
	}, []);

	useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && phase !== "running") {
				setOpen(false);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open, phase]);

	const handlePickTemplate = useCallback((id: ScenarioTemplateId) => {
		setActiveScenarioId((prev) => (prev === id ? null : id));
		setPrompt((prev) => {
			const tpl = promptTemplateFor(id);
			if (!prev.trim()) return tpl;
			const knownTemplates = Object.values(SCENARIO_TEMPLATES).map((s) =>
				promptTemplateFor(s.id),
			);
			if (knownTemplates.includes(prev.trim())) return tpl;
			return prev;
		});
	}, []);

	const handleCancel = useCallback(() => {
		cancelledRef.current = true;
		setPhase("cancelled");
		dispatchAIActionBusy({
			action: "transcribe",
			busy: false,
			source: "ai-enhance-panel",
		});
	}, []);

	const handleEnhance = useCallback(async () => {
		if (!activeScenarioId) return;
		const scenario = getScenarioTemplate(activeScenarioId);
		const actions = resolveScenarioActions(scenario);
		if (actions.length === 0) return;

		setPhase("running");
		setCurrentActionIndex(0);
		setTotalActions(actions.length);
		setErrorMessage(null);
		cancelledRef.current = false;
		startedAtRef.current = Date.now();

		let failed = false;
		for (let i = 0; i < actions.length; i++) {
			if (cancelledRef.current) break;
			setCurrentActionIndex(i);
			dispatchAIActionBusy({
				action: actions[i],
				busy: true,
				source: "ai-enhance-panel",
			});
			try {
				await runAction(actions[i], {
					prompt: prompt.trim() || promptTemplateFor(scenario.id),
					hotwordDomain: scenario.recommendedHotwordDomain,
				});
			} catch (err) {
				failed = true;
				setErrorMessage(err instanceof Error ? err.message : String(err));
				break;
			} finally {
				dispatchAIActionBusy({
					action: actions[i],
					busy: false,
					source: "ai-enhance-panel",
				});
			}
		}

		if (cancelledRef.current) {
			setPhase("cancelled");
		} else if (failed) {
			setPhase("error");
		} else {
			setPhase("done");
		}

		const dur = Date.now() - (startedAtRef.current ?? Date.now());
		setHistory((prev) => {
			const item: HistoryItem = {
				id: String(Date.now()),
				timestamp: Date.now(),
				scenarioName: scenario.name,
				actionCount: actions.length,
				status: cancelledRef.current ? "cancelled" : failed ? "error" : "done",
				durationMs: dur,
			};
			return [item, ...prev].slice(0, HISTORY_LIMIT);
		});
	}, [activeScenarioId, prompt, runAction]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const onBusy = (event: Event) => {
			if (!isAIActionBusyDetail(event)) return;
			// 监听外部 busy 事件 (这里仅占位, UI 渲染在 AIEnhancePanel 自身 state)
			void (event as unknown as { detail: unknown }).detail;
		};
		window.addEventListener(AI_ACTION_BUSY_EVENT, onBusy);
		return () => window.removeEventListener(AI_ACTION_BUSY_EVENT, onBusy);
	}, []);

	const progressPct = useMemo(() => {
		if (phase !== "running") return phase === "done" ? 100 : 0;
		if (totalActions === 0) return 0;
		return Math.min(100, Math.round(((currentActionIndex + 1) / totalActions) * 100));
	}, [phase, currentActionIndex, totalActions]);

	const runningStepLabel = useMemo(() => {
		const scenario = activeScenarioId ? getScenarioTemplate(activeScenarioId) : null;
		if (!scenario) return undefined;
		const actions = resolveScenarioActions(scenario);
		const a = actions[currentActionIndex];
		return a ? (ACTION_LABEL_ZH[a] ?? shortLabelForAction(a)) : undefined;
	}, [currentActionIndex, activeScenarioId]);

	if (!open) return null;

	const ctaDisabled = phase === "running" || !activeScenarioId;
	const ctaStyle = ctaDisabled ? PRIMARY_CTA_DISABLED_STYLE : PRIMARY_CTA_STYLE;

	return (
		<div
			style={OVERLAY_STYLE}
			data-ai-enhance-overlay
			onMouseDown={(event) => {
				if (event.target === event.currentTarget && phase !== "running") {
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
						disabled={phase === "running"}
						aria-label="关闭"
						style={{
							...CLOSE_BTN_STYLE,
							...(phase === "running" ? { opacity: 0.4, cursor: "not-allowed" } : {}),
						}}
					>
						<X size={14} weight="bold" />
					</button>
				</header>

				<div style={BODY_STYLE}>
					<div>
						<p style={LABEL_STYLE}>告诉 AI 你想对这个录屏做什么</p>
						<textarea
							style={TEXTAREA_STYLE}
							placeholder="例如: 把这段录屏加中文翻译字幕"
							value={prompt}
							onChange={(event) => setPrompt(event.target.value)}
							disabled={phase === "running"}
							rows={4}
							data-ai-enhance-prompt
						/>
					</div>

					<div>
						<p style={LABEL_STYLE}>场景模板 (点击自动配置)</p>
						<div style={TEMPLATE_ROW_STYLE}>
							{Object.values(SCENARIO_TEMPLATES).map((scenario) => {
								const active = activeScenarioId === scenario.id;
								return (
									<button
										key={scenario.id}
										type="button"
										onClick={() => handlePickTemplate(scenario.id)}
										disabled={phase === "running"}
										style={getTemplateChipStyle(active)}
										data-ai-enhance-template={scenario.id}
										onMouseEnter={(event) => {
											if (!active) {
												event.currentTarget.style.background =
													COLORS.bgSecondary;
											}
										}}
										onMouseLeave={(event) => {
											if (!active) {
												event.currentTarget.style.background =
													COLORS.bgPrimary;
											}
										}}
									>
										{active && (
											<span
												style={{
													width: "6px",
													height: "6px",
													borderRadius: "999px",
													background: COLORS.accent,
												}}
											/>
										)}
										{scenario.name}
									</button>
								);
							})}
						</div>
					</div>

					<button
						type="button"
						onClick={() => void handleEnhance()}
						disabled={ctaDisabled}
						style={ctaStyle}
						data-ai-enhance-cta
					>
						{phase === "running" ? (
							<>
								<CircleNotch size={14} weight="bold" className="animate-spin" />
								正在执行...
							</>
						) : (
							<>
								<Lightning size={14} weight="fill" />
								一键增强
								<ArrowRight size={13} />
							</>
						)}
					</button>

					{(phase === "running" || phase === "done" || phase === "error") && (
						<div data-ai-enhance-progress>
							<ProgressBar
								currentStep={currentActionIndex + 1}
								totalSteps={totalActions}
								percent={progressPct}
								elapsedMs={Date.now() - (startedAtRef.current ?? Date.now())}
								runningStepLabel={runningStepLabel}
								onCancel={handleCancel}
								cancelLabel="取消"
							/>
							{phase === "error" && errorMessage && (
								<p
									style={{
										margin: "8px 0 0 0",
										fontSize: "12px",
										color: "#ef4444",
									}}
									data-ai-enhance-error
								>
									{errorMessage}
								</p>
							)}
						</div>
					)}

					{history.length > 0 && (
						<div data-ai-enhance-history>
							<p style={LABEL_STYLE}>最近操作</p>
							<ul style={HISTORY_LIST_STYLE}>
								{history.map((item) => {
									const dotStyle =
										item.status === "error"
											? STATUS_DOT_FAIL_STYLE
											: STATUS_DOT_DONE_STYLE;
									const timeStr = new Date(item.timestamp).toLocaleTimeString(
										"zh-CN",
										{ hour: "2-digit", minute: "2-digit" },
									);
									const durStr = `${(item.durationMs / 1000).toFixed(1)}s`;
									return (
										<li key={item.id} style={HISTORY_ITEM_STYLE}>
											<span style={dotStyle} />
											<span style={{ flex: 1 }}>
												{timeStr} · {item.scenarioName} · {item.actionCount}{" "}
												项 · {durStr}
											</span>
											<span
												style={{
													fontSize: "11px",
													color: COLORS.textMuted,
												}}
											>
												{item.status === "done"
													? "✓"
													: item.status === "cancelled"
														? "已取消"
														: "失败"}
											</span>
										</li>
									);
								})}
							</ul>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export const AIEnhancePanel = memo(AIEnhancePanelImpl);
export default AIEnhancePanel;
