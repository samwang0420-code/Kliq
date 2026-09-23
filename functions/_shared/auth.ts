/**
 * Kliq — 账户系统共享工具 (§59-2)
 *
 * 提供:
 *   - PBKDF2-SHA256 100k iter 密码哈希 / 验证
 *   - 32-byte random session token (URL-safe base64) + sha256 hash
 *   - D1 query helpers: findUserByEmail / createUser / createSession / deleteSession / findSessionByToken / upgradeUserToLifetime
 *   - 通用 JSON response helpers
 *
 * 设计要点:
 *   - 用 Web Crypto API (CF Workers V8 isolate + Node 20+ 都支持)
 *   - 不存明文 token (DB 存 sha256(token))
 *   - 所有时间用 ms epoch
 */

export const PBKDF2_ITERATIONS = 100_000;
export const PBKDF2_HASH = "SHA-256";
export const PBKDF2_KEY_BITS = 256;
export const SALT_BYTES = 16;
export const TOKEN_BYTES = 32;
export const SESSION_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/* -------------------------------------------------------------------------- */
/*  Encoding helpers                                                          */
/* -------------------------------------------------------------------------- */

const HEX_CHARS = "0123456789abcdef";

export function bytesToHex(bytes: Uint8Array): string {
	let out = "";
	for (let i = 0; i < bytes.length; i++) {
		const b = bytes[i];
		out += HEX_CHARS[b >>> 4] + HEX_CHARS[b & 0x0f];
	}
	return out;
}

export function hexToBytes(hex: string): Uint8Array {
	if (hex.length % 2 !== 0) throw new Error("hex string must have even length");
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

/* -------------------------------------------------------------------------- */
/*  Password hashing (PBKDF2-SHA256)                                          */
/* -------------------------------------------------------------------------- */

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const hash = await pbkdf2(password, salt);
	return { hash: bytesToHex(hash), salt: bytesToHex(salt) };
}

export async function verifyPassword(
	password: string,
	saltHex: string,
	expectedHashHex: string,
): Promise<boolean> {
	const salt = hexToBytes(saltHex);
	const expected = hexToBytes(expectedHashHex);
	const actual = await pbkdf2(password, salt);
	return timingSafeEqual(actual, expected);
}

async function pbkdf2(password: string, salt: Uint8Array): Promise<Uint8Array> {
	const enc = new TextEncoder();
	const baseKey = await crypto.subtle.importKey(
		"raw",
		enc.encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const derived = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt,
			iterations: PBKDF2_ITERATIONS,
			hash: PBKDF2_HASH,
		},
		baseKey,
		PBKDF2_KEY_BITS,
	);
	return new Uint8Array(derived);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
	}
	return diff === 0;
}

/* -------------------------------------------------------------------------- */
/*  Session token                                                             */
/* -------------------------------------------------------------------------- */

/** Generate a 43-char URL-safe base64 token (32 bytes raw). */
export function generateSessionToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
	return base64UrlEncode(bytes);
}

/** Hash a session token for DB storage. */
export async function hashSessionToken(token: string): Promise<string> {
	const enc = new TextEncoder();
	const buf = await crypto.subtle.digest("SHA-256", enc.encode(token));
	return bytesToHex(new Uint8Array(buf));
}

function base64UrlEncode(bytes: Uint8Array): string {
	let bin = "";
	for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ?? 0);
	const b64 = btoa(bin);
	return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* -------------------------------------------------------------------------- */
/*  Validation                                                                */
/* -------------------------------------------------------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
	if (email.length > 254) return false;
	return EMAIL_RE.test(email);
}

export function isValidPassword(password: string): { ok: boolean; reason?: string } {
	if (password.length < 8) return { ok: false, reason: "weak_password" };
	if (password.length > 128) return { ok: false, reason: "weak_password" };
	return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  D1 row types                                                              */
/* -------------------------------------------------------------------------- */

export type UserRow = {
	id: number;
	email: string;
	password_hash: string;
	password_salt: string;
	created_at: number;
	updated_at: number;
	tier: "free" | "lifetime";
};

export type SessionRow = {
	token_hash: string;
	user_id: number;
	expires_at: number;
	created_at: number;
};

export type SubscriptionRow = {
	id: number;
	user_id: number;
	tier: "lifetime";
	started_at: number;
	expires_at: number | null;
	waffo_session_id: string | null;
};

/* -------------------------------------------------------------------------- */
/*  D1 query helpers                                                          */
/* -------------------------------------------------------------------------- */

export async function findUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
	return db
		.prepare("SELECT * FROM users WHERE email = ?1")
		.bind(email.toLowerCase())
		.first<UserRow>();
}

export async function findUserById(db: D1Database, id: number): Promise<UserRow | null> {
	return db.prepare("SELECT * FROM users WHERE id = ?1").bind(id).first<UserRow>();
}

export async function createUser(
	db: D1Database,
	email: string,
	passwordHash: string,
	passwordSalt: string,
): Promise<UserRow> {
	const now = Date.now();
	const result = await db
		.prepare(
			"INSERT INTO users (email, password_hash, password_salt, created_at, updated_at, tier) VALUES (?1, ?2, ?3, ?4, ?5, 'free') RETURNING *",
		)
		.bind(email.toLowerCase(), passwordHash, passwordSalt, now, now)
		.first<UserRow>();
	if (!result) throw new Error("createUser: RETURNING returned no row");
	return result;
}

export async function createSession(
	db: D1Database,
	userId: number,
	tokenHash: string,
): Promise<SessionRow> {
	const now = Date.now();
	const expiresAt = now + SESSION_LIFETIME_MS;
	const row = await db
		.prepare(
			"INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4) RETURNING *",
		)
		.bind(tokenHash, userId, expiresAt, now)
		.first<SessionRow>();
	if (!row) throw new Error("createSession: RETURNING returned no row");
	return row;
}

export async function deleteSession(db: D1Database, tokenHash: string): Promise<void> {
	await db.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(tokenHash).run();
}

export async function findSessionByTokenHash(
	db: D1Database,
	tokenHash: string,
): Promise<SessionRow | null> {
	const row = await db
		.prepare("SELECT * FROM sessions WHERE token_hash = ?1")
		.bind(tokenHash)
		.first<SessionRow>();
	if (!row) return null;
	if (row.expires_at < Date.now()) {
		// expired — best-effort cleanup
		await deleteSession(db, tokenHash).catch(() => {});
		return null;
	}
	return row;
}

export async function upgradeUserToLifetime(
	db: D1Database,
	email: string,
	waffoSessionId: string,
): Promise<{ subscriptionId: number; tier: "lifetime" }> {
	const user = await findUserByEmail(db, email);
	if (!user) throw new Error(`upgradeUserToLifetime: user not found: ${email}`);
	const now = Date.now();
	const existing = await db
		.prepare("SELECT id FROM subscriptions WHERE waffo_session_id = ?1")
		.bind(waffoSessionId)
		.first<{ id: number }>();
	if (existing) return { subscriptionId: existing.id, tier: "lifetime" };
	const sub = await db
		.prepare(
			"INSERT INTO subscriptions (user_id, tier, started_at, expires_at, waffo_session_id) VALUES (?1, 'lifetime', ?2, NULL, ?3) RETURNING id",
		)
		.bind(user.id, now, waffoSessionId)
		.first<{ id: number }>();
	if (!sub) throw new Error("upgradeUserToLifetime: RETURNING returned no id");
	await db
		.prepare("UPDATE users SET tier = 'lifetime', updated_at = ?1 WHERE id = ?2")
		.bind(now, user.id)
		.run();
	return { subscriptionId: sub.id, tier: "lifetime" };
}

/* -------------------------------------------------------------------------- */
/*  Response helpers                                                          */
/* -------------------------------------------------------------------------- */

export function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json; charset=utf-8" },
	});
}

export function errorResponse(code: string, status: number): Response {
	return jsonResponse({ error: code }, status);
}

/** Extract Bearer token from Authorization header; returns null if missing/invalid. */
export function extractBearerToken(req: Request): string | null {
	const auth = req.headers.get("Authorization");
	if (!auth) return null;
	const [scheme, token] = auth.split(" ");
	if (scheme?.toLowerCase() !== "bearer" || !token) return null;
	return token;
}

/** Map UserRow to public user object (drop password fields). */
export function publicUser(row: UserRow): {
	id: number;
	email: string;
	tier: "free" | "lifetime";
	createdAt: number;
} {
	return {
		id: row.id,
		email: row.email,
		tier: row.tier,
		createdAt: row.created_at,
	};
}
