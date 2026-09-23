/**
 * Kliq — 账户系统配置（§59-5）
 *
 * Single source of truth for the auth subsystem. Kept separate from licenseConfig
 * (which still holds the legacy license-key constants that §59-6 will delete).
 *
 * Storage:
 *   - `kliq.auth.token` — URL-safe base64 session token returned by /api/auth/login + register
 *
 * Network:
 *   - KLQ_SITE_URL — root of the deployed Pages project (e.g. https://yanjingai.tech)
 *     All auth endpoints are derived as `${SITE}/api/auth/*`.
 *
 * Event:
 *   - `kliq:auth-changed` — fired after login / logout / upgrade to let every
 *     useUser() consumer re-fetch.
 */

const rawEnv = (import.meta.env ?? {}) as Record<string, string | undefined>;

function normalizeUrl(value: string | undefined): string {
	const trimmed = (value ?? "").trim();
	return trimmed ? trimmed.replace(/\/+$/, "") : "";
}

/** Site root for auth + license endpoints. */
export const KLQ_SITE_URL = normalizeUrl(rawEnv.VITE_KLQ_SITE_URL);

/** localStorage key holding the current session token. */
export const KLQ_AUTH_TOKEN_STORAGE_KEY = "kliq.auth.token";

/** Custom event name — useUser listeners re-fetch on this. */
export const KLQ_AUTH_CHANGED_EVENT = "kliq:auth-changed";
