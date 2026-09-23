/**
 * Kliq — 当前登录用户 React binding (§59-5)
 *
 * - 启动时从 localStorage 读 `kliq.auth.token`
 * - 拉一次 `/api/auth/me` 验证 token + 拿到当前 user（含 tier）
 * - 暴露 `refresh()` 给刚完成登录 / 升级的场景
 * - 暴露 `logout()` 清 token 并广播 `kliq:auth-changed` 让所有组件重拉
 *
 * §18 — 不动现有 `useLicenseStatus` / `licenseConfig` / `license.ts`，待 §59-6 统一删
 */

import { useCallback, useEffect, useState } from "react";
import { KLQ_AUTH_TOKEN_STORAGE_KEY, KLQ_SITE_URL } from "@/lib/authConfig";

export type AuthUser = {
	id: number;
	email: string;
	tier: "free" | "lifetime";
	createdAt: number;
};

export type AuthState =
	| { status: "loading"; user: null }
	| { status: "anonymous"; user: null }
	| { status: "authenticated"; user: AuthUser };

export const AUTH_CHANGED_EVENT = "kliq:auth-changed";

/** Broadcast so other useUser() instances re-fetch after login / logout / upgrade. */
export function emitAuthChanged(): void {
	if (typeof window !== "undefined") {
		window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
	}
}

export function readToken(): string | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(KLQ_AUTH_TOKEN_STORAGE_KEY);
		return raw && raw.trim() ? raw.trim() : null;
	} catch {
		return null;
	}
}

export async function fetchMe(token: string): Promise<AuthUser | null> {
	const siteBase = KLQ_SITE_URL;
	if (!siteBase) {
		// Site URL not configured → we can't validate the token against the backend.
		// Stay anonymous rather than faking authentication.
		return null;
	}
	const url = `${siteBase}/api/auth/me`;
	try {
		const res = await fetch(url, {
			method: "GET",
			headers: { Authorization: `Bearer ${token}` },
		});
		if (res.status === 200) {
			const body = (await res.json()) as { user: AuthUser };
			return body.user ?? null;
		}
		// 401/403/5xx → treat as anonymous (don't throw)
		return null;
	} catch {
		// Network failure → keep token (might be offline) but don't claim auth
		return null;
	}
}

/**
 * useUser — single source of truth for "who's logged in".
 *
 * Returns a discriminated `AuthState` so callers must narrow on `status` before
 * reading `user`. Re-renders on:
 *   - mount
 *   - localStorage token change
 *   - `kliq:auth-changed` custom event (broadcast by login / register / logout / upgrade flows)
 *   - explicit `refresh()` call
 */
export function useUser(): {
	state: AuthState;
	refresh: () => Promise<void>;
	logout: () => void;
	token: string | null;
} {
	const [state, setState] = useState<AuthState>({ status: "loading", user: null });

	const load = useCallback(async () => {
		const token = readToken();
		if (!token) {
			setState({ status: "anonymous", user: null });
			return;
		}
		const user = await fetchMe(token);
		if (user) {
			setState({ status: "authenticated", user });
		} else {
			setState({ status: "anonymous", user: null });
		}
	}, []);

	// Initial load + event subscription
	useEffect(() => {
		void load();
		const onChange = () => void load();
		if (typeof window !== "undefined") {
			window.addEventListener(AUTH_CHANGED_EVENT, onChange);
			// localStorage changes from other tabs
			window.addEventListener("storage", onChange);
		}
		return () => {
			if (typeof window !== "undefined") {
				window.removeEventListener(AUTH_CHANGED_EVENT, onChange);
				window.removeEventListener("storage", onChange);
			}
		};
	}, [load]);

	const logout = useCallback(() => {
		if (typeof window !== "undefined") {
			try {
				window.localStorage.removeItem(KLQ_AUTH_TOKEN_STORAGE_KEY);
			} catch {
				/* ignore */
			}
		}
		emitAuthChanged();
	}, []);

	return { state, refresh: load, logout, token: readToken() };
}

export default useUser;
