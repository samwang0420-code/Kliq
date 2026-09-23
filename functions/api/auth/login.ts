/**
 * Kliq — POST /api/auth/login (§59-2)
 *
 * Body: { email: string, password: string }
 * 200: { user: {...}, token: string }
 * 401: { error: "invalid_credentials" }
 * 400: { error: "invalid_body" }
 */

import {
	createSession,
	errorResponse,
	findUserByEmail,
	generateSessionToken,
	hashSessionToken,
	isValidEmail,
	jsonResponse,
	publicUser,
	verifyPassword,
} from "../../_shared/auth";

interface Env {
	DB: D1Database;
}

interface LoginBody {
	email?: unknown;
	password?: unknown;
}

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
	let body: LoginBody;
	try {
		body = (await request.json()) as LoginBody;
	} catch {
		return errorResponse("invalid_body", 400);
	}

	const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
	const password = typeof body.password === "string" ? body.password : "";

	if (!isValidEmail(email) || !password) {
		return errorResponse("invalid_credentials", 401);
	}

	const user = await findUserByEmail(env.DB, email);
	if (!user) {
		// constant-time-ish: still hash a dummy password to avoid trivial timing oracle
		await verifyPassword(password, "00".repeat(16), "00".repeat(32)).catch(() => {});
		return errorResponse("invalid_credentials", 401);
	}

	const ok = await verifyPassword(password, user.password_salt, user.password_hash);
	if (!ok) return errorResponse("invalid_credentials", 401);

	const token = generateSessionToken();
	const tokenHash = await hashSessionToken(token);
	await createSession(env.DB, user.id, tokenHash);

	return jsonResponse({ user: publicUser(user), token }, 200);
};
