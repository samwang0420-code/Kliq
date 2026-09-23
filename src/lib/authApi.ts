/**
 * Kliq — Auth API client (§59-7)
 *
 * Thin fetch wrappers for the four Pages Functions:
 *   POST /api/auth/register  → { token, user }
 *   POST /api/auth/login     → { token, user }
 *   POST /api/auth/logout    → 204 + removes server-side session row
 *   GET  /api/auth/me        → { user } | 401
 *
 * The Bearer token returned by register/login is persisted by AuthProvider in
 * localStorage (`kliq.auth.token`). We never store passwords locally — that
 * round-trips through the server on every login.
 *
 * §213 — plain inline styles on caller side; this file is pure network + types.
 */

import { KLQ_AUTH_CHANGED_EVENT, KLQ_AUTH_TOKEN_STORAGE_KEY, KLQ_SITE_URL } from "@/lib/authConfig";

export type AuthTier = "free" | "lifetime";

export interface AuthUser {
	id: number;
	email: string;
	tier: AuthTier;
	createdAt: number;
}

export class AuthApiError extends Error {
	readonly status: number;
	readonly code?: string;
	constructor(message: string, status: number, code?: string) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

function readToken(): string | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(KLQ_AUTH_TOKEN_STORAGE_KEY);
		return raw && raw.trim() ? raw.trim() : null;
	} catch {
		return null;
	}
}

function persistToken(token: string): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(KLQ_AUTH_TOKEN_STORAGE_KEY, token);
	} catch {
		/* ignore quota errors — caller will see fail on next /me call */
	}
	if (typeof window.dispatchEvent === "function") {
		window.dispatchEvent(new CustomEvent(KLQ_AUTH_CHANGED_EVENT));
	}
}

function clearToken(): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.removeItem(KLQ_AUTH_TOKEN_STORAGE_KEY);
	} catch {
		/* ignore */
	}
	if (typeof window.dispatchEvent === "function") {
		window.dispatchEvent(new CustomEvent(KLQ_AUTH_CHANGED_EVENT));
	}
}

interface AuthResponse {
	token: string;
	user: AuthUser;
}

function endpoint(path: string): string {
	const base = KLQ_SITE_URL;
	if (!base) {
		throw new AuthApiError(
			"Site URL is not configured (VITE_KLQ_SITE_URL). Auth endpoints unreachable.",
			0,
			"no_site_url",
		);
	}
	return base + path;
}

async function postJson<T>(path: string, body: unknown, token?: string | null): Promise<T> {
	const url = endpoint(path);
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (token) headers.Authorization = "Bearer " + token;
	const res = await fetch(url, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		let detail = "";
		let code: string | undefined;
		try {
			const errBody = (await res.json()) as {
				error?: string;
				code?: string;
				detail?: string;
			};
			detail = errBody.detail ?? errBody.error ?? "";
			code = errBody.code;
		} catch {
			/* ignore parse error */
		}
		throw new AuthApiError(
			detail || "Request failed with HTTP " + String(res.status),
			res.status,
			code,
		);
	}
	if (res.status === 204) return undefined as unknown as T;
	return (await res.json()) as T;
}

async function getJson<T>(path: string, token?: string | null): Promise<T> {
	const url = endpoint(path);
	const headers: Record<string, string> = {};
	if (token) headers.Authorization = "Bearer " + token;
	const res = await fetch(url, { method: "GET", headers });
	if (!res.ok) {
		let detail = "";
		try {
			const errBody = (await res.json()) as { error?: string; detail?: string };
			detail = errBody.detail ?? errBody.error ?? "";
		} catch {
			/* ignore */
		}
		throw new AuthApiError(
			detail || "Request failed with HTTP " + String(res.status),
			res.status,
		);
	}
	return (await res.json()) as T;
}

export async function register(email: string, password: string): Promise<AuthUser> {
	const { token, user } = await postJson<AuthResponse>("/api/auth/register", {
		email,
		password,
	});
	persistToken(token);
	return user;
}

export async function login(email: string, password: string): Promise<AuthUser> {
	const { token, user } = await postJson<AuthResponse>("/api/auth/login", {
		email,
		password,
	});
	persistToken(token);
	return user;
}

/** Server-side session row delete + local clear + broadcast. */
export async function logout(): Promise<void> {
	const token = readToken();
	if (!token) {
		clearToken();
		return;
	}
	try {
		await postJson<undefined>("/api/auth/logout", {}, token);
	} catch {
		/* network failures don't prevent local clear */
	}
	clearToken();
}

/** Validate the cached token against the server and return the user. */
export async function fetchMe(token: string): Promise<AuthUser> {
	const { user } = await getJson<{ user: AuthUser }>("/api/auth/me", token);
	return user;
}

/** Lazily requested change-password endpoint. Backend may not exist yet. */
export async function requestPasswordChange(
	currentPassword: string,
	newPassword: string,
): Promise<void> {
	await postJson<undefined>(
		"/api/auth/change-password",
		{ currentPassword, newPassword },
		readToken(),
	);
}

export const __test__ = { readToken, persistToken, clearToken };
