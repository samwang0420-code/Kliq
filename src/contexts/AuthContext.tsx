/**
 * Kliq — 全局 AuthContext (§59-5)
 *
 * Provides { state, refresh, logout } to every component under the editor tree.
 * Mounted once in src/components/video-editor/layout/EditorShell.tsx (or the
 * existing global context root — keep the same shape as ThemeContext/I18nContext).
 *
 * §213 inline-style note: this file has no UI — it's just context plumbing.
 */

import { createContext, type ReactNode, useContext } from "react";
import { type AuthState, useUser } from "@/hooks/useUser";

export interface AuthContextValue {
	state: AuthState;
	refresh: () => Promise<void>;
	logout: () => void;
	token: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const value = useUser();
	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook — throws if no provider mounted (better DX than silent `null`). */
export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext);
	if (!ctx) {
		throw new Error("useAuth must be used within <AuthProvider>");
	}
	return ctx;
}

/** Selector helpers — keep call-sites tidy. */
export function useAuthUser(): AuthContextValue["state"] {
	return useAuth().state;
}

export function useIsAuthenticated(): boolean {
	return useAuth().state.status === "authenticated";
}

export function useIsLifetime(): boolean {
	const { state } = useAuth();
	return state.status === "authenticated" && state.user.tier === "lifetime";
}

export default AuthContext;
