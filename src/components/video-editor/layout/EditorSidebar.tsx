/**
 * Kliq — Sidebar 整体重设计 (§60 用户拍板)
 *
 * 用户原话 (2026-09-23):
 *   "你需要把相关的功能放到这列功能列，AI 能力等，
 *    你要提升审美能力，现在用户中心和整体的调性差的太远了"
 *
 * 设计:
 *   - 9 个图标入口（AI 增强 / AI 字幕 / AI 服务 / Cursor / Webcam / Settings / 扩展 + Account）
 *   - AI 入口 dispatch event 弹独立面板/弹窗，不走 SettingsPanel
 *   - 其余 4 个走 activeEffectSection（Cursor / Webcam / Settings / 扩展）
 *   - 视觉 §213 inline 极简：黑/白/灰阶/绿点/8px 圆角/120-160ms ease/1px 边框
 *   - 删 motion / framer / Tailwind className / 蓝色 #2563EB 激活态
 *   - Phosphor regular → active 时 fill（重量对比代替颜色对比）
 */
import {
  Camera,
  ChatCircle,
  Cpu,
  Cursor,
  Gear,
  PuzzlePiece,
  Sparkle,
  UserCircle,
} from "@phosphor-icons/react";
import {
  type ComponentProps,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
  useMemo,
} from "react";
import { openAccountCenter } from "@/lib/proGate";
import { useIsPro } from "@/hooks/useLicenseStatus";
import type { useI18n } from "@/contexts/I18nContext";
import ExtensionManager from "../ExtensionManager";
import { SettingsPanel } from "../SettingsPanel";
import type { EditorEffectSection } from "../types";

/* §213 design tokens */
const COLORS = {
  black: "#0a0a0a",
  white: "#ffffff",
  bg: "#ffffff",
  sidebarBg: "#fafafa",
  border: "#e4e4e7",
  muted: "#71717a",
  subtleBg: "#f4f4f5",
  accent: "#22c55e",
};

const RADIUS = 8;
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const DURATION_MS = 160;

type SidebarAction =
  | { kind: "section"; section: EditorEffectSection }
  | { kind: "event"; eventName: string };

type NavItem = {
  id: string;
  label: string;
  icon: typeof Camera;
  action: SidebarAction;
};

type Props = {
  t: ReturnType<typeof useI18n>["t"];
  activeSection: EditorEffectSection;
  setActiveSection: Dispatch<SetStateAction<EditorEffectSection>>;
  settingsPanelProps: ComponentProps<typeof SettingsPanel>;
};

export function EditorSidebar({
  t,
  activeSection,
  setActiveSection,
  settingsPanelProps,
}: Props): ReactNode {
  const isPro = useIsPro();

  // §60 9 图标 — AI 能力入口优先
  const items = useMemo<NavItem[]>(
    () => [
      {
        id: "ai-enhance",
        label: t("yanjing.sidebar.aiEnhance", "AI 增强"),
        icon: Sparkle,
        action: { kind: "event", eventName: "kliq:open-ai-enhance" },
      },
      {
        id: "ai-captions",
        label: t("yanjing.sidebar.aiCaptions", "AI 字幕"),
        icon: ChatCircle,
        action: { kind: "event", eventName: "kliq:open-ai-captions" },
      },
      {
        id: "ai-service",
        label: t("yanjing.sidebar.aiService", "AI 服务"),
        icon: Cpu,
        action: { kind: "event", eventName: "kliq:open-ai-service" },
      },
      {
        id: "cursor",
        label: t("settings.sections.cursor", "Cursor"),
        icon: Cursor,
        action: { kind: "section", section: "cursor" },
      },
      {
        id: "webcam",
        label: t("settings.sections.webcam", "Webcam"),
        icon: Camera,
        action: { kind: "section", section: "webcam" },
      },
      {
        id: "settings",
        label: t("settings.sections.settings", "Settings"),
        icon: Gear,
        action: { kind: "section", section: "settings" },
      },
      {
        id: "extensions",
        label: t("settings.sections.extensions", "Extensions"),
        icon: PuzzlePiece,
        action: { kind: "section", section: "extensions" },
      },
    ],
    [t],
  );

  const handleClick = (item: NavItem): void => {
    if (item.action.kind === "event") {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(item.action.eventName));
      }
      return;
    }
    setActiveSection(item.action.section);
  };

  const renderNavButton = (item: NavItem): ReactNode => {
    const isActive =
      item.action.kind === "section" ? activeSection === item.action.section : false;
    const Icon = item.icon;

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => handleClick(item)}
        title={item.label}
        aria-label={item.label}
        data-testid={`sidebar-${item.id}`}
        data-active={isActive ? "true" : "false"}
        style={{
          position: "relative",
          width: 40,
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: RADIUS,
          background: isActive ? COLORS.subtleBg : "transparent",
          border: isActive
            ? `1px solid ${COLORS.border}`
            : "1px solid transparent",
          cursor: "pointer",
          padding: 0,
          transition: `all ${DURATION_MS}ms ${EASE}`,
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = COLORS.subtleBg;
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = "transparent";
        }}
      >
        <Icon
          size={22}
          weight={isActive ? "fill" : "regular"}
          color={isActive ? COLORS.accent : COLORS.muted}
          style={{ transition: `all ${DURATION_MS}ms ${EASE}` }}
        />
        {isActive ? (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 6,
              top: 6,
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: COLORS.accent,
            }}
          />
        ) : null}
      </button>
    );
  };

  const isExtensions = activeSection === "extensions";

  return (
    <div
      style={{
        display: "flex",
        flexShrink: 0,
        gap: 6,
        height: "100%",
      }}
    >
      <nav
        aria-label="Sidebar navigation"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          padding: 12,
          background: COLORS.sidebarBg,
          borderRight: `1px solid ${COLORS.border}`,
          width: 64,
          flexShrink: 0,
        }}
      >
        {/* AI 能力分组 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            width: "100%",
            alignItems: "center",
          }}
        >
          {items.slice(0, 3).map(renderNavButton)}
        </div>

        {/* 分隔线 */}
        <div
          aria-hidden="true"
          style={{
            width: 24,
            height: 1,
            background: COLORS.border,
            margin: "8px 0",
          }}
        />

        {/* 编辑设置分组 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            width: "100%",
            alignItems: "center",
          }}
        >
          {items.slice(3, 6).map(renderNavButton)}
        </div>

        {/* 扩展单独 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            width: "100%",
            alignItems: "center",
          }}
        >
          {renderNavButton(items[6]!)}
        </div>

        {/* 底部 Account */}
        <div style={{ marginTop: "auto" }}>
          <button
            type="button"
            onClick={() => openAccountCenter()}
            title={t("editor.account.title", "Account")}
            aria-label={t("editor.account.title", "Account")}
            data-testid="account-center-trigger"
            style={{
              position: "relative",
              width: 40,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: RADIUS,
              background: "transparent",
              border: "1px solid transparent",
              cursor: "pointer",
              padding: 0,
              transition: `all ${DURATION_MS}ms ${EASE}`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = COLORS.subtleBg;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <UserCircle
              size={22}
              weight="regular"
              color={COLORS.muted}
              style={{ transition: `all ${DURATION_MS}ms ${EASE}` }}
            />
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                right: 6,
                top: 6,
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: isPro ? COLORS.accent : COLORS.subtleBg,
                border: isPro ? "none" : `1px solid ${COLORS.border}`,
              }}
            />
          </button>
        </div>
      </nav>

      {isExtensions ? <ExtensionManager /> : <SettingsPanel {...settingsPanelProps} />}
    </div>
  );
}
