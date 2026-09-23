/**
 * Kliq — POST /api/auth/logout (§59-2)
 *
 * Header: Authorization: Bearer <token>
 * 204: No Content
 * 401: { error: "invalid_token" | "missing_token" }
 */

import {
	deleteSession,
	errorResponse,
	extractBearerToken,
	hashSessionToken,
} from "../../_shared/auth";

interface Env {
	DB: D1Database;
}

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
	const token = extractBearerToken(request);
	if (!token) return errorResponse("missing_token", 401);

	const tokenHash = await hashSessionToken(token);
	await deleteSession(env.DB, tokenHash);

	return new Response(null, { status: 204 });
};
