import {
	ArrowSquareOut,
	ChatCircleDots,
	Envelope,
	GithubLogo,
	Info,
	Receipt,
} from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import {
	KLQ_ISSUES_URL,
	KLQ_LICENSE_REQUEST_EMAIL,
	KLQ_REFUND_POLICY_URL,
	KLQ_REPO_URL,
	buildLicenseRequestMailto,
} from "@/lib/licenseConfig";

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
		aFallback: "Kliq 本身不收 AI 用量费。AI 调用你自己的 OpenAI / DeepSeek API。",
	},
	{
		qKey: "yanjing.account.faqRefundQ",
		qFallback: "可以退款吗?",
		aKey: "yanjing.account.faqRefundA",
		aFallback: "购买后 30 天内无理由退款。",
	},
	{
		qKey: "yanjing.account.faqTeamQ",
		qFallback: "公司 / 团队能用吗?",
		aKey: "yanjing.account.faqTeamA",
		aFallback: "单用户 License 同时只能在一台设备激活。",
	},
	{
		qKey: "yanjing.account.faqUpdateQ",
		qFallback: "Pro 到期后还能用吗?",
		aKey: "yanjing.account.faqProExpireA",
		aFallback: "Pro 到期后自动回到免费版,可续费 Pro 或升级 Lifetime。",
	},
];

function MailLink({ to, subject, children }: { to: string; subject: string; children: ReactNode }): ReactNode {
	const href = "mailto:" + to + "?subject=" + encodeURIComponent(subject);
	return (
		<a
			href={href}
			className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs transition-colors hover:bg-foreground/5"
		>
			{children}
			<ArrowSquareOut size={11} />
		</a>
	);
}

export function HelpTab(): ReactNode {
	const t = useScopedT("common");
	const [openIdx, setOpenIdx] = useState<number | null>(0);

	return (
		<div className="space-y-6">
			{/* 联系方式 */}
			<section className="space-y-3">
				<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{t("yanjing.account.tabHelp", "帮助")}
				</h3>
				<div className="flex flex-col gap-2">
					<MailLink
						to={KLQ_LICENSE_REQUEST_EMAIL}
						subject="Kliq Help"
					>
						<Envelope size={13} />
						{t("yanjing.account.recoverActionEmail", "写邮件申请")}
					</MailLink>
					<a
						href={KLQ_ISSUES_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 transition-colors hover:bg-foreground/5"
					>
						<GithubLogo size={13} />
						{t("yanjing.account.feedback", "反馈问题")}
						<ArrowSquareOut size={11} />
					</a>
					<a
						href={KLQ_REFUND_POLICY_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 transition-colors hover:bg-foreground/5"
					>
						<Receipt size={13} />
						{t("yanjing.account.refundPolicy", "退款政策")}
						<ArrowSquareOut size={11} />
					</a>
				</div>
			</section>

			{/* FAQ */}
			<section className="space-y-3">
				<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					FAQ
				</h3>
				<ul className="space-y-2">
					{FAQ_ITEMS.map((item, idx) => {
						const open = openIdx === idx;
						return (
							<li
								key={idx}
								className="overflow-hidden rounded-md border border-border/60"
							>
								<button
									type="button"
									onClick={() => setOpenIdx(open ? null : idx)}
									className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-foreground/5"
									aria-expanded={open}
								>
									<span>{t(item.qKey, item.qFallback)}</span>
									<span
										className="text-xs text-muted-foreground transition-transform"
										style={{ transform: open ? "rotate(180deg)" : "none" }}
									>
										▾
									</span>
								</button>
								{open && (
									<div className="border-t border-border/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
										{t(item.aKey, item.aFallback)}
									</div>
								)}
							</li>
						);
					})}
				</ul>
			</section>

			{/* 关于 / AGPL */}
			<section className="rounded-lg border border-dashed border-border/60 px-4 py-3">
				<div className="flex items-start gap-2">
					<Info size={12} weight="bold" className="mt-0.5 shrink-0 text-muted-foreground" />
					<div className="flex-1 text-[11px] leading-relaxed text-muted-foreground">
						<p>{t("yanjing.account.licenseNote", "AGPL 3.0 · 基于 Recordly 修改 · 独立维护")}</p>
						<a
							href={KLQ_REPO_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="mt-1.5 inline-flex items-center gap-1 hover:underline"
						>
							<GithubLogo size={11} />
							{t("yanjing.account.sourceCode", "源码")}
							<ArrowSquareOut size={9} />
						</a>
					</div>
				</div>
			</section>

			{/* 意见反馈 (TODO 占位, 沿 §18 不主动做) */}
			<section
				className="rounded-lg border border-dashed border-border/60 px-4 py-3"
			>
				<div className="flex items-start gap-2">
					<ChatCircleDots size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
					<p className="text-[11px] leading-relaxed text-muted-foreground">
						{t(
							"yanjing.account.feedback",
							"反馈问题",
						)}{" "}
						→{" "}
						<MailLink
							to={KLQ_LICENSE_REQUEST_EMAIL}
							subject={buildLicenseRequestMailto("recover").split("?subject=")[1] ?? "Kliq Feedback"}
						>
							<Envelope size={11} />
							{KLQ_LICENSE_REQUEST_EMAIL}
						</MailLink>
					</p>
				</div>
			</section>
		</div>
	);
}

export default HelpTab;
