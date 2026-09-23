/**
 * Kliq — Account Tab (§59-7 重设计)
 *
 * 用户拍板决策:
 *   1. 注册服务像 Cursor/Codex — 邮箱+密码注册 → D1, 登录拿 Bearer token
 *   2. 默认 Free, 升级 Lifetime only (Pro/Team 删 — §59-8)
 *
 * 完全替换之前的 license-key 输入/激活/停用/备份/恢复流程 (§59-6 将删 license.ts):
 *   - 未登录: 注册 / 登录表单 (§213 inline 极简)
 *   - 已登录: tier badge (Free / Lifetime) + 邮箱 + 登出 + AGPL footer
 *
 * §213 inline 极简风: 黑(#0a0a0a) + 白(#ffffff) + 5 档灰阶, 8px 圆角, 1px 边框,
 * 唯一 accent #22c55e, 字体 Inter (EN) + Noto Sans SC (ZH), 120-160ms ease.
 */

import { Envelope, Info, SignOut, Sparkle } from "@phosphor-icons/react";
import { type CSSProperties, type ReactNode, useCallback, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useScopedT } from "@/contexts/I18nContext";
import { AuthApiError, logout as apiLogout, register as apiRegister, login } from "@/lib/authApi";
import { KLQ_REPO_URL } from "@/lib/licenseConfig";
import { toast } from "@/lib/toast";

/* ---------- §213 design tokens ---------- */

const ACCENT = "#22c55e";
const FG = "#0a0a0a";
const BG = "#ffffff";
const BORDER = "#e4e4e7";
const MUTED = "#71717a";
const DEEP_MUTED = "#a1a1aa";
const SUBTLE_BG = "#fafafa";

const inputStyle: CSSProperties = {
	width: "100%",
	padding: "10px 12px",
	fontSize: 14,
	color: FG,
	backgroundColor: SUBTLE_BG,
	border: "1px solid " + BORDER,
	borderRadius: 8,
	outline: "none",
	boxSizing: "border-box",
	transition: "border-color 160ms cubic-bezier(0.16, 1, 0.3, 1)",
	fontFamily: "inherit",
};

function primaryBtnStyle(disabled: boolean): CSSProperties {
	return {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		width: "100%",
		padding: "10px 16px",
		fontSize: 14,
		fontWeight: 600,
		color: BG,
		backgroundColor: disabled ? DEEP_MUTED : FG,
		border: "none",
		borderRadius: 8,
		cursor: disabled ? "not-allowed" : "pointer",
		transition: "background-color 160ms cubic-bezier(0.16, 1, 0.3, 1)",
	};
}

const secondaryBtnStyle: CSSProperties = {
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	gap: 8,
	padding: "8px 14px",
	fontSize: 13,
	fontWeight: 500,
	color: FG,
	backgroundColor: BG,
	border: "1px solid " + BORDER,
	borderRadius: 8,
	cursor: "pointer",
	transition: "all 160ms cubic-bezier(0.16, 1, 0.3, 1)",
};

function isValidEmail(email: string): boolean {
	const t = email.trim();
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function describeAuthError(err: unknown, _fallback: string): string {
	if (err instanceof AuthApiError) {
		if (err.status === 400) return "请检查邮箱和密码格式";
		if (err.status === 401) return "邮箱或密码错误";
		if (err.status === 409) return "该邮箱已被注册";
		if (err.status === 0) return "无法连接服务,请检查网络后重试";
		if (err.status >= 500) return "服务暂时不可用,请稍后再试";
		return err.message;
	}
	if (err instanceof Error && err.message) return err.message;
	return "未知错误";
}

/* ---------- anonymous: register / login form ---------- */

function AuthForm({ t }: { t: (key: string, fallback?: string) => string }) {
	const [mode, setMode] = useState<"login" | "register">("login");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = useCallback(
		async (event: React.FormEvent) => {
			event.preventDefault();
			const emailTrim = email.trim();
			const passwordTrim = password;
			if (!isValidEmail(emailTrim)) {
				setError("请输入合法邮箱地址");
				return;
			}
			if (passwordTrim.length < 8) {
				setError("密码至少 8 位");
				return;
			}
			setBusy(true);
			setError(null);
			try {
				if (mode === "login") {
					await login(emailTrim, passwordTrim);
				} else {
					await apiRegister(emailTrim, passwordTrim);
				}
			} catch (err) {
				setError(describeAuthError(err, mode === "login" ? "登录失败" : "注册失败"));
			} finally {
				setBusy(false);
			}
		},
		[email, password, mode],
	);

	const tabButton = (key: "login" | "register"): CSSProperties => ({
		flex: 1,
		padding: "10px 12px",
		fontSize: 13,
		fontWeight: 500,
		color: mode === key ? FG : MUTED,
		backgroundColor: "transparent",
		borderBottom: mode === key ? "2px solid " + FG : "2px solid transparent",
		cursor: "pointer",
		transition: "color 160ms cubic-bezier(0.16, 1, 0.3, 1)",
	});

	return (
		<form
			onSubmit={(e) => void handleSubmit(e)}
			style={{ display: "flex", flexDirection: "column", gap: 20 }}
		>
			<div
				style={{
					display: "flex",
					gap: 0,
					borderBottom: "1px solid " + BORDER,
				}}
			>
				<button type="button" onClick={() => setMode("login")} style={tabButton("login")}>
					{t("yanjing.account.tabLogin", "登录")}
				</button>
				<button
					type="button"
					onClick={() => setMode("register")}
					style={tabButton("register")}
				>
					{t("yanjing.account.tabRegister", "注册")}
				</button>
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
				<label
					style={{
						fontSize: 12,
						fontWeight: 500,
						color: MUTED,
						letterSpacing: "0.04em",
						textTransform: "uppercase",
					}}
				>
					{t("yanjing.account.emailLabel", "邮箱")}
				</label>
				<input
					type="email"
					autoComplete="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					placeholder="you@example.com"
					required
					style={inputStyle}
				/>
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
				<label
					style={{
						fontSize: 12,
						fontWeight: 500,
						color: MUTED,
						letterSpacing: "0.04em",
						textTransform: "uppercase",
					}}
				>
					{t("yanjing.account.passwordLabel", "密码")}
				</label>
				<input
					type="password"
					autoComplete={mode === "login" ? "current-password" : "new-password"}
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					placeholder={t("yanjing.account.passwordPlaceholder", "至少 8 位")}
					minLength={8}
					required
					style={inputStyle}
				/>
				<p
					style={{
						fontSize: 11,
						color: DEEP_MUTED,
						lineHeight: 1.5,
					}}
				>
					{t("yanjing.account.neverStored", "密码仅用于登录 / 注册,永不存储在本地。")}
				</p>
			</div>

			{error ? (
				<div
					role="alert"
					style={{
						fontSize: 12,
						color: "#b91c1c",
						backgroundColor: "#fef2f2",
						border: "1px solid #fecaca",
						borderRadius: 8,
						padding: "8px 12px",
					}}
				>
					{error}
				</div>
			) : null}

			<button type="submit" disabled={busy} style={primaryBtnStyle(busy)}>
				{busy
					? t("yanjing.account.submitting", "提交中…")
					: mode === "login"
						? t("yanjing.account.loginCta", "登录")
						: t("yanjing.account.registerCta", "注册")}
			</button>
		</form>
	);
}

/* ---------- authenticated: tier badge + logout ---------- */

export function AccountTab(): ReactNode {
	const t = useScopedT("common");
	const { state, refresh, logout } = useAuth();

	const handleLogout = useCallback(async () => {
		try {
			await apiLogout();
			logout();
			toast.success(t("yanjing.account.loggedOut", "已登出"));
		} catch (_err) {
			logout();
		}
	}, [t, logout]);

	if (state.status === "loading") {
		return (
			<div
				style={{
					padding: 32,
					textAlign: "center",
					color: MUTED,
					fontSize: 13,
				}}
			>
				{t("yanjing.account.loadingAccount", "正在读取账户信息…")}
			</div>
		);
	}

	if (state.status === "anonymous") {
		return <AuthForm t={t} />;
	}

	const user = state.user;
	const isLifetime = user.tier === "lifetime";

	// handleLogout moved above early returns (see React hooks rule)

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
			<section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
					<div
						aria-hidden
						style={{
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							width: 40,
							height: 40,
							borderRadius: 8,
							backgroundColor: isLifetime ? ACCENT : SUBTLE_BG,
							color: isLifetime ? BG : FG,
							flexShrink: 0,
						}}
					>
						{isLifetime ? (
							<Sparkle size={20} weight="fill" />
						) : (
							<Envelope size={20} weight="regular" />
						)}
					</div>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 2,
							minWidth: 0,
						}}
					>
						<div
							style={{
								fontSize: 14,
								fontWeight: 600,
								color: FG,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
						>
							{user.email}
						</div>
						<div style={{ fontSize: 12, color: MUTED }}>
							{isLifetime
								? t("yanjing.account.tierLifetime", "Lifetime 会员 · 永久免费升级")
								: t("yanjing.account.tierFree", "免费版 · 可升级到 Lifetime")}
						</div>
					</div>
				</div>

				{isLifetime ? (
					<div
						data-testid="lifetime-badge"
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 6,
							padding: "4px 10px",
							fontSize: 11,
							fontWeight: 600,
							color: FG,
							backgroundColor: BG,
							border: "1px solid " + FG,
							borderRadius: 999,
							letterSpacing: "0.04em",
							textTransform: "uppercase",
							width: "fit-content",
						}}
					>
						<span
							aria-hidden
							style={{
								display: "inline-block",
								width: 6,
								height: 6,
								borderRadius: 999,
								backgroundColor: ACCENT,
							}}
						/>
						LIFETIME
					</div>
				) : null}
			</section>

			<section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
				<button type="button" onClick={() => void refresh()} style={secondaryBtnStyle}>
					{t("yanjing.account.refreshSession", "刷新会话")}
				</button>
				<button type="button" onClick={() => void handleLogout()} style={secondaryBtnStyle}>
					<SignOut size={14} />
					{t("yanjing.account.logoutCta", "登出")}
				</button>
			</section>

			<section
				style={{
					padding: 12,
					borderRadius: 8,
					border: "1px dashed " + BORDER,
					display: "flex",
					gap: 8,
				}}
			>
				<Info
					size={12}
					weight="bold"
					style={{ color: MUTED, flexShrink: 0, marginTop: 2 }}
				/>
				<p
					style={{
						fontSize: 11,
						color: MUTED,
						lineHeight: 1.55,
						margin: 0,
					}}
				>
					{t("yanjing.account.licenseNote", "AGPL 3.0 · 基于 Recordly 修改 · 独立维护")}
					{" · "}
					<a
						href={KLQ_REPO_URL}
						target="_blank"
						rel="noreferrer"
						style={{
							color: FG,
							textDecoration: "underline",
							textUnderlineOffset: 2,
						}}
					>
						{KLQ_REPO_URL.replace("https://", "")}
					</a>
				</p>
			</section>
		</div>
	);
}

/** Backward-compat stub — tier labels belong to ProTab now. */
export function featureLabel(
	_t: (key: string, fallback?: string) => string,
	feature: string | null | undefined,
): string | null {
	if (!feature) return null;
	return feature;
}

export default AccountTab;
