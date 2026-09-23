/**
 * Kliq — Help Tab (§60 §213 inline 极简重写)
 *
 * 用户原话 (2026-09-23):
 *   "你需要把相关的功能放到这列功能列，AI 能力等，
 *    你要提升审美能力，现在用户中心和整体的调性差的太远了"
 *
 * §60 视觉统一: AccountCenterPanel 所有 Tab 都 §213 inline 极简
 *   黑(#0a0a0a) + 白(#ffffff) + 5 档灰阶 + #22c55e 绿点 + 8px 圆角 + 1px 边框
 *   字体 Inter (EN) + Noto Sans SC (ZH) + JetBrains Mono
 *   120-160ms ease cubic-bezier(0.16, 1, 0.3, 1)
 */
import {
  ArrowSquareOut,
  ChatCircleDots,
  Envelope,
  GithubLogo,
  Info,
  Receipt,
} from "@phosphor-icons/react";
import { type CSSProperties, type ReactNode, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import {
  buildLicenseRequestMailto,
  KLQ_ISSUES_URL,
  KLQ_LICENSE_REQUEST_EMAIL,
  KLQ_REFUND_POLICY_URL,
  KLQ_REPO_URL,
} from "@/lib/licenseConfig";

/* §213 design tokens */
const COLORS = {
  black: "#0a0a0a",
  white: "#ffffff",
  bg: "#ffffff",
  bgSecondary: "#fafafa",
  border: "#e4e4e7",
  muted: "#71717a",
  deepMuted: "#a1a1aa",
  accent: "#22c55e",
};

const RADIUS = 8;
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const DURATION_MS = 160;

type FaqItem = { qKey: string; qFallback: string; aKey: string; aFallback: string };

const FAQ_ITEMS: ReadonlyArray<FaqItem> = [
  {
    qKey: "yanjing.account.faqLifetimeQ",
    qFallback: "Lifetime 跟 Pro 有什么区别?",
    aKey: "yanjing.account.faqLifetimeA",
    aFallback: "Pro 是按年订阅,Lifetime 一次性买断,后续所有功能永久免费升级。",
  },
  {
    qKey: "yanjing.account.faqAiCostQ",
    qFallback: "AI 转录 / 字幕需要额外付费吗?",
    aKey: "yanjing.account.faqAiCostA",
    aFallback: "需要。您在 AI 服务里填自己的 OpenAI / DeepSeek Key, 费用直接走您的账户。",
  },
];

const linkButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 12px",
  fontSize: 13,
  color: COLORS.black,
  backgroundColor: COLORS.white,
  border: `1px solid ${COLORS.border}`,
  borderRadius: RADIUS,
  textDecoration: "none",
  cursor: "pointer",
  transition: `all ${DURATION_MS}ms ${EASE}`,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: COLORS.deepMuted,
  marginBottom: 8,
};

const cardStyle: CSSProperties = {
  padding: 16,
  backgroundColor: COLORS.bgSecondary,
  border: `1px solid ${COLORS.border}`,
  borderRadius: RADIUS,
};

type MailLinkProps = {
  to: string;
  subject: string;
  children: ReactNode;
};

function MailLink({ to, subject, children }: MailLinkProps): ReactNode {
  const href = "mailto:" + to + "?subject=" + encodeURIComponent(subject);
  return (
    <a href={href} style={linkButtonStyle}>
      {children}
      <ArrowSquareOut size={11} />
    </a>
  );
}

export function HelpTab(): ReactNode {
  const t = useScopedT("common");
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* 联系方式 */}
      <section>
        <h3 style={sectionTitleStyle}>
          {t("yanjing.account.tabHelp", "帮助")}
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <MailLink to={KLQ_LICENSE_REQUEST_EMAIL} subject="Kliq Help">
            <Envelope size={13} weight="regular" />
            {t("yanjing.account.recoverActionEmail", "写邮件申请")}
          </MailLink>
          <a
            href={KLQ_ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={linkButtonStyle}
          >
            <GithubLogo size={13} weight="regular" />
            {t("yanjing.account.feedback", "反馈问题")}
            <ArrowSquareOut size={11} />
          </a>
          <a
            href={KLQ_REFUND_POLICY_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={linkButtonStyle}
          >
            <Receipt size={13} weight="regular" />
            {t("yanjing.account.refundPolicy", "退款政策")}
            <ArrowSquareOut size={11} />
          </a>
        </div>
      </section>

      {/* FAQ */}
      <section>
        <h3 style={sectionTitleStyle}>FAQ</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {FAQ_ITEMS.map((item, idx) => {
            const open = openIdx === idx;
            return (
              <div
                key={idx}
                style={{
                  overflow: "hidden",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: RADIUS,
                  backgroundColor: COLORS.white,
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpenIdx(open ? null : idx)}
                  aria-expanded={open}
                  style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "10px 12px",
                    fontSize: 13,
                    color: COLORS.black,
                    backgroundColor: open ? COLORS.bgSecondary : COLORS.white,
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: `background-color ${DURATION_MS}ms ${EASE}`,
                  }}
                >
                  <span>{t(item.qKey, item.qFallback)}</span>
                  <span
                    style={{
                      fontSize: 11,
                      color: COLORS.muted,
                      transform: open ? "rotate(180deg)" : "none",
                      transition: `transform ${DURATION_MS}ms ${EASE}`,
                    }}
                  >
                    ▾
                  </span>
                </button>
                {open ? (
                  <div
                    style={{
                      borderTop: `1px solid ${COLORS.border}`,
                      padding: "10px 12px",
                      fontSize: 12,
                      lineHeight: 1.6,
                      color: COLORS.muted,
                    }}
                  >
                    {t(item.aKey, item.aFallback)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {/* 关于 / AGPL */}
      <section style={cardStyle}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <Info
            size={12}
            weight="bold"
            color={COLORS.muted}
            style={{ marginTop: 2, flexShrink: 0 }}
          />
          <div style={{ flex: 1, fontSize: 11, lineHeight: 1.6, color: COLORS.muted }}>
            <p style={{ margin: 0 }}>
              {t(
                "yanjing.account.licenseNote",
                "AGPL 3.0 · 基于 Recordly 修改 · 独立维护",
              )}
            </p>
            <a
              href={KLQ_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                marginTop: 6,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                color: COLORS.black,
                textDecoration: "none",
                fontSize: 11,
              }}
            >
              <GithubLogo size={11} weight="regular" />
              {t("yanjing.account.sourceCode", "源码")}
              <ArrowSquareOut size={9} />
            </a>
          </div>
        </div>
      </section>

      {/* 意见反馈 (沿 §18 不主动做) */}
      <section style={cardStyle}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <ChatCircleDots
            size={13}
            weight="regular"
            color={COLORS.muted}
            style={{ marginTop: 2, flexShrink: 0 }}
          />
          <p style={{ flex: 1, fontSize: 11, lineHeight: 1.6, color: COLORS.muted, margin: 0 }}>
            {t("yanjing.account.feedback", "反馈问题")} →{" "}
            <MailLink
              to={KLQ_LICENSE_REQUEST_EMAIL}
              subject={
                buildLicenseRequestMailto("recover").split("?subject=")[1] ??
                "Kliq Feedback"
              }
            >
              <Envelope size={11} weight="regular" />
              {KLQ_LICENSE_REQUEST_EMAIL}
            </MailLink>
          </p>
        </div>
      </section>
    </div>
  );
}

export default HelpTab;
