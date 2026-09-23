/**
 * Kliq — AI Service Panel (§60 用户拍板)
 *
 * 用户原话 (2026-09-23):
 *   "我们只有一套 AI 服务，让用户下拉选择什么 AI 服务就行了，然后填写 Key"
 *
 * 设计:
 *   - 自包含 modal — 监听 kliq:open-ai-service 事件显示
 *   - 复用 AiServiceSection (§59-9 单 dropdown + 单 key 输入)
 *   - §213 inline 极简风
 */
import { Cpu, X } from "@phosphor-icons/react";
import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { AiServiceSection } from "@/components/account/AiServiceSection";

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
  width: "min(640px, calc(100vw - 32px))",
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

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const titleStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  color: COLORS.black,
  margin: 0,
  letterSpacing: "-0.01em",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const closeButtonStyle: CSSProperties = {
  width: 32,
  height: 32,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: RADIUS,
  backgroundColor: "transparent",
  border: `1px solid ${COLORS.border}`,
  cursor: "pointer",
  color: COLORS.muted,
  transition: `all ${DURATION_MS}ms ${EASE}`,
};

export function AIServicePanel(): ReactNode | null {
  const t = useScopedT("common");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onClose = () => setOpen(false);
    window.addEventListener("kliq:open-ai-service", onOpen);
    window.addEventListener("kliq:open-ai-service-exit", onClose);
    return () => {
      window.removeEventListener("kliq:open-ai-service", onOpen);
      window.removeEventListener("kliq:open-ai-service-exit", onClose);
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

  if (!open) return null;

  return (
    <div style={overlayStyle} onMouseDown={onBackdropMouseDown} data-ai-service-overlay>
      <div style={panelStyle} role="dialog" aria-modal="true">
        <header style={headerStyle}>
          <h2 style={titleStyle}>
            <Cpu size={20} weight="fill" color={COLORS.accent} />
            {t("yanjing.sidebar.aiService", "AI 服务")}
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("common.close", "关闭")}
            style={closeButtonStyle}
            data-ai-service-close
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = COLORS.bgSecondary;
              e.currentTarget.style.color = COLORS.black;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = COLORS.muted;
            }}
          >
            <X size={14} weight="bold" />
          </button>
        </header>

        <AiServiceSection isProActive={false} />
      </div>
    </div>
  );
}
