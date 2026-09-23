/**
 * Kliq — POST /api/auth/register (§59-2)
 *
 * Body: { email: string, password: string }
 * 200: { user: { id, email, tier, createdAt }, token: string (43 chars) }
 * 400: { error: "invalid_email" | "weak_password" | "email_taken" | "invalid_body" }
 * 500: { error: "internal_error" }
 */

import {
	createSession,
	createUser,
	errorResponse,
	findUserByEmail,
	generateSessionToken,
	hashPassword,
	hashSessionToken,
	isValidEmail,
	isValidPassword,
	jsonResponse,
	publicUser,
} from "../../_shared/auth";

interface Env {
	DB: D1Database;
}

interface RegisterBody {
	email?: unknown;
	password?: unknown;
}

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
	let body: RegisterBody;
	try {
		body = (await request.json()) as RegisterBody;
	} catch {
		return errorResponse("invalid_body", 400);
	}

	const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
	const password = typeof body.password === "string" ? body.password : "";

	if (!isValidEmail(email)) return errorResponse("invalid_email", 400);
	const pw = isValidPassword(password);
	if (!pw.ok) return errorResponse("weak_password", 400);

	const existing = await findUserByEmail(env.DB, email);
	if (existing) return errorResponse("email_taken", 400);

	const { hash, salt } = await hashPassword(password);
	const user = await createUser(env.DB, email, hash, salt);

	const token = generateSessionToken();
	const tokenHash = await hashSessionToken(token);
	await createSession(env.DB, user.id, tokenHash);

	return jsonResponse({ user: publicUser(user), token }, 200);
};
