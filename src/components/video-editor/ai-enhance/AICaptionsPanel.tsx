/**
 * Kliq — AI Captions Panel (§60 用户拍板)
 *
 * 用户原话 (2026-09-23):
 *   "现有的字幕入口让 AI 替换掉"
 *
 * 设计:
 *   - 自包含 modal — 监听 kliq:open-ai-captions 事件显示
 *   - 4 个 AI 字幕相关 action (转录 / 双语 / 多语言 / 校对)
 *   - 点击 dispatch kliq:ai-enhance-open 事件（带 action 参数）让 AIEnhancePanel 处理
 *   - §213 inline 极简风
 */
import { ChatCircle, Globe, Microphone, TextAa } from "@phosphor-icons/react";
import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useScopedT } from "@/contexts/I18nContext";

/* §213 design tokens */
const COLORS = {
  black: "#0a0a0a",
  white: "#ffffff",
  bgSecondary: "#fafafa",
  border: "#e4e4e7",
  muted: "#71717a",
  deepMuted: "#a1a1aa",
  accent: "#22c55e",
};

const RADIUS = 8;
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const DURATION_MS = 160;

type CaptionAction = "transcribe" | "bilingual" | "translate-multi" | "proofread";

type ActionItem = {
  id: CaptionAction;
  labelKey: string;
  labelFallback: string;
  descKey: string;
  descFallback: string;
  icon: typeof Microphone;
};

const ACTIONS: ReadonlyArray<ActionItem> = [
  {
    id: "transcribe",
    labelKey: "yanjing.sidebar.captions.transcribe",
    labelFallback: "AI 转录",
    descKey: "yanjing.sidebar.captions.transcribeDesc",
    descFallback: "Whisper 转录音频为文字（仅 OpenAI Key）",
    icon: Microphone,
  },
  {
    id: "bilingual",
    labelKey: "yanjing.sidebar.captions.bilingual",
    labelFallback: "AI 双语字幕",
    descKey: "yanjing.sidebar.captions.bilingualDesc",
    descFallback: "转录 + 翻译成中文（生成双语 SRT）",
    icon: ChatCircle,
  },
  {
    id: "translate-multi",
    labelKey: "yanjing.sidebar.captions.translateMulti",
    labelFallback: "AI 多语言字幕",
    descKey: "yanjing.sidebar.captions.translateMultiDesc",
    descFallback: "翻译成英 / 日 / 韩 / 西班牙等多语言字幕",
    icon: Globe,
  },
  {
    id: "proofread",
    labelKey: "yanjing.sidebar.captions.proofread",
    labelFallback: "AI 字幕校对",
    descKey: "yanjing.sidebar.captions.proofreadDesc",
    descFallback: "GPT 检查错字 + 修正标点 + 行业热词应用",
    icon: TextAa,
  },
];

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
  backdropFilter: "blur(4px)",
};

const panelStyle: CSSProperties = {
  width: "min(560px, calc(100vw - 32px))",
  maxHeight: "calc(100vh - 64px)",
  backgroundColor: COLORS.white,
  border: `1px solid ${COLORS.border}`,
  borderRadius: RADIUS,
  padding: 32,
  display: "flex",
  flexDirection: "column",
  gap: 24,
  overflow: "auto",
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans SC', sans-serif",
};

const headerTitleStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  color: COLORS.black,
  margin: 0,
  letterSpacing: "-0.01em",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: 14,
  backgroundColor: COLORS.white,
  border: `1px solid ${COLORS.border}`,
  borderRadius: RADIUS,
  cursor: "pointer",
  textAlign: "left",
  width: "100%",
  transition: `all ${DURATION_MS}ms ${EASE}`,
};

export function AICaptionsPanel(): ReactNode | null {
  const t = useScopedT("common");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onClose = () => setOpen(false);
    window.addEventListener("kliq:open-ai-captions", onOpen);
    window.addEventListener("kliq:open-ai-captions-exit", onClose);
    return () => {
      window.removeEventListener("kliq:open-ai-captions", onOpen);
      window.removeEventListener("kliq:open-ai-captions-exit", onClose);
    };
  }, []);

  const onBackdropMouseDown = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const handleAction = (action: CaptionAction): void => {
    window.dispatchEvent(
      new CustomEvent("kliq:open-ai-enhance", { detail: { action } }),
    );
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div style={overlayStyle} onMouseDown={onBackdropMouseDown} data-ai-captions-overlay>
      <div style={panelStyle} role="dialog" aria-modal="true">
        <header>
          <h2 style={headerTitleStyle}>
            <ChatCircle size={20} weight="fill" color={COLORS.accent} />
            {t("yanjing.sidebar.aiCaptions", "AI 字幕")}
          </h2>
        </header>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => handleAction(action.id)}
                style={actionRowStyle}
                data-ai-captions-action={action.id}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = COLORS.black;
                  e.currentTarget.style.backgroundColor = COLORS.bgSecondary;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = COLORS.border;
                  e.currentTarget.style.backgroundColor = COLORS.white;
                }}
              >
                <span
                  style={{
                    display: "flex",
                    width: 32,
                    height: 32,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: RADIUS,
                    backgroundColor: COLORS.bgSecondary,
                    border: `1px solid ${COLORS.border}`,
                    flexShrink: 0,
                  }}
                >
                  <Icon size={16} weight="regular" color={COLORS.black} />
                </span>
                <span style={{ flex: 1 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 14,
                      fontWeight: 500,
                      color: COLORS.black,
                      marginBottom: 2,
                    }}
                  >
                    {t(action.labelKey, action.labelFallback)}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: COLORS.muted,
                      lineHeight: 1.5,
                    }}
                  >
                    {t(action.descKey, action.descFallback)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <footer
          style={{
            fontSize: 11,
            color: COLORS.deepMuted,
            lineHeight: 1.5,
          }}
        >
          {t(
            "yanjing.sidebar.captions.footer",
            "提示: 转录和双语字幕依赖 OpenAI Key（语音转写仅 OpenAI 提供）。其他字幕操作可用 DeepSeek。",
          )}
        </footer>
      </div>
    </div>
  );
}
