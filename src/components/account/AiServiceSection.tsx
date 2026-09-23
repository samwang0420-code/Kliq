/**
 * Kliq — 「AI 服务」配置区块 (§59-9 重设计: 单 dropdown + 单 key 输入)
 *
 * 用户拍板 (2026-09-23):
 *   "AI 服务, 为什么既有 deepseek又又有 openai, 我们只有一套 AI 服务,
 *    让用户下拉选择什么 AI 服务就行了, 然后填写 Key"
 *
 * 设计:
 *   - 单 dropdown 选 backend (openai / deepseek 二选一)
 *   - 单 key 输入框, 写入当前 backend 对应的 ApiKeyEntry
 *   - save / remove 按钮 (沿 §55 §213 inline 极简风)
 *   - 删 baseUrl/model 配置 (沿用默认 openai.com / deepseek.com + gpt-4o-mini / deepseek-chat)
 *
 * 后端能力边界 (这是物理事实, 不是取舍):
 *   - OpenAI    : Whisper 转录 + 全部文本动作 (音频转写只有 OpenAI 系提供)
 *   - DeepSeek  : 仅文本动作 (章节/摘要/标题/标签/社媒文案/翻译/校对), 无 audio 端点
 *   语义搜索额外依赖 embeddings 端点, 固定需要 OpenAI.
 */

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { type ChatProvider, getChatProvider, setChatProvider } from "@/lib/ai/provider";
import {
  type ApiKeyEntry,
  deleteApiKey,
  getApiKey,
  maskApiKey,
  setApiKey,
  validateApiKeyFormat,
} from "@/lib/apiKeys";
import { toast } from "@/lib/toast";

/* §213 design tokens */
const FG = "#0a0a0a";
const BG = "#ffffff";
const BORDER = "#e4e4e7";
const MUTED = "#71717a";
const SUBTLE_BG = "#fafafa";
const ACCENT = "#22c55e";

/** 2 个 backend, 用户拍板只接 openai / deepseek (§59-10) */
const BACKENDS: ReadonlyArray<{
  id: ChatProvider;
  label: string;
  hintKey: string;
  hintFallback: string;
  placeholder: string;
}> = [
  {
    id: "openai",
    label: "OpenAI",
    hintKey: "common.yanjing.account.ai.scopeOpenai",
    hintFallback: "转录 + 全部文本动作",
    placeholder: "sk-...",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    hintKey: "common.yanjing.account.ai.scopeDeepseek",
    hintFallback: "仅文本动作 (无语音转写)",
    placeholder: "sk-...",
  },
];

type ElectronSettingsLike = {
  getAppSetting?: (key: string) => unknown;
  setAppSetting?: (key: string, value: unknown) => boolean;
};

function settingsAvailable(): boolean {
  const api = (globalThis as typeof globalThis & { electronAPI?: ElectronSettingsLike })
    .electronAPI;
  return typeof api?.getAppSetting === "function" && typeof api?.setAppSetting === "function";
}

const SELECT_STYLE = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: "inherit",
  color: FG,
  backgroundColor: BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  outline: "none",
  cursor: "pointer",
  transition: "border-color 160ms cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

const INPUT_STYLE = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  color: FG,
  backgroundColor: BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  outline: "none",
  transition: "border-color 160ms cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

const PRIMARY_BTN = (busy: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 600,
  color: BG,
  backgroundColor: busy ? MUTED : FG,
  border: "none",
  borderRadius: 8,
  transition: "background-color 160ms cubic-bezier(0.16, 1, 0.3, 1)",
  cursor: busy ? "not-allowed" : "pointer",
});

const SECONDARY_BTN: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 500,
  color: FG,
  backgroundColor: BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  transition: "all 160ms cubic-bezier(0.16, 1, 0.3, 1)",
  cursor: "pointer",
};

export function AiServiceSection({ isProActive: _isProActive }: { isProActive: boolean }) {
  const { t } = useI18n();
  const available = settingsAvailable();

  const [backend, setBackendState] = useState<ChatProvider>(() => getChatProvider());
  const [entry, setEntry] = useState<ApiKeyEntry | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);

  const reload = useCallback((b: ChatProvider) => {
    const current = getApiKey(b);
    setEntry(current);
    setKey("");
  }, []);

  useEffect(() => {
    reload(backend);
  }, [backend, reload]);

  const handleBackend = useCallback(
    (next: ChatProvider) => {
      const result = setChatProvider(next);
      if (!result.success) {
        toast.error(result.error ?? t("common.yanjing.account.ai.saveFailed", "保存失败"));
        return;
      }
      setBackendState(next);
    },
    [t],
  );

  const handleSave = useCallback(() => {
    const trimmed = key.trim();
    if (!trimmed) {
      toast.error(t("common.yanjing.account.ai.emptyKey", "请输入 API Key"));
      return;
    }
    if (!validateApiKeyFormat(backend, trimmed)) {
      toast.error(t("common.yanjing.account.ai.invalidFormat", "格式看起来不对, key 应以 sk- 开头"));
      return;
    }
    setBusy("save");
    try {
      const result = setApiKey({
        provider: backend,
        apiKey: trimmed,
        updatedAt: Date.now(),
      });
      if (!result.success) {
        toast.error(result.error ?? t("common.yanjing.account.ai.saveFailed", "保存失败"));
        return;
      }
      toast.success(t("common.yanjing.account.ai.saved", "已保存 · 密钥仅存本机"));
      reload(backend);
    } finally {
      setBusy(null);
    }
  }, [key, backend, t, reload]);

  const handleRemove = useCallback(() => {
    setBusy("remove");
    try {
      deleteApiKey(backend);
      toast.success(t("common.yanjing.account.ai.removed", "已移除该服务的密钥"));
      reload(backend);
    } finally {
      setBusy(null);
    }
  }, [backend, t, reload]);

  const configured = entry !== null;
  const currentBackend = BACKENDS.find((b) => b.id === backend)!;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: FG }}>
        {t("common.yanjing.account.ai.title", "AI 服务")}
      </h3>

      {!available && (
        <div
          style={{
            padding: "10px 12px",
            fontSize: 12,
            color: MUTED,
            backgroundColor: SUBTLE_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            lineHeight: 1.5,
          }}
        >
          {t(
            "common.yanjing.account.ai.unavailable",
            "当前环境无法读写本地设置: 密钥只能保存在桌面端 (Electron), 浏览器预览里配置不会生效。",
          )}
        </div>
      )}

      <p style={{ margin: 0, fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
        {t(
          "common.yanjing.account.ai.hint",
          "AI 动作调用的是你自己的 AI 账号, 我们不代付, 也拿不到你的密钥 — 它只写在本机设置里。",
        )}
      </p>

      {/* Backend 单 dropdown */}
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: FG }}>
          {t("common.yanjing.account.ai.backendLabel", "AI 服务")}
        </span>
        <select
          value={backend}
          onChange={(e) => handleBackend(e.target.value as ChatProvider)}
          style={SELECT_STYLE}
          data-testid="ai-backend-select"
        >
          {BACKENDS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label} — {t(b.hintKey, b.hintFallback)}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: MUTED }}>
          {t(currentBackend.hintKey, currentBackend.hintFallback)}
        </span>
      </label>

      {/* Key 输入 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: FG }}>
          {t("common.yanjing.account.ai.keyLabel", "API Key")}
        </span>
        {configured && entry && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              alignSelf: "flex-start",
              padding: "2px 8px",
              fontSize: 11,
              fontWeight: 500,
              color: ACCENT,
              backgroundColor: `${ACCENT}1f`,
              borderRadius: 999,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                backgroundColor: ACCENT,
              }}
            />
            {t("common.yanjing.account.ai.configured", "已配置")} · {maskApiKey(entry.apiKey)}
          </div>
        )}
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={configured ? "••••••••" : currentBackend.placeholder}
          spellCheck={false}
          autoComplete="off"
          style={INPUT_STYLE}
          data-testid="ai-key-input"
        />
      </div>

      {/* Save / Remove */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        {configured && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy !== null}
            style={SECONDARY_BTN}
            data-testid="ai-remove-btn"
          >
            {t("common.yanjing.account.ai.remove", "移除")}
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={busy !== null}
          style={PRIMARY_BTN(busy === "save")}
          data-testid="ai-save-btn"
        >
          {t("common.yanjing.account.ai.save", "保存")}
        </button>
      </div>
    </section>
  );
}

export default AiServiceSection;
