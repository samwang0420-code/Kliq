/**
 * Kliq — GET /api/auth/me (§59-2)
 *
 * Header: Authorization: Bearer <token>
 * 200: { user: { id, email, tier, createdAt }, subscription: {...} | null }
 * 401: { error: "invalid_token" | "missing_token" }
 */

import {
	errorResponse,
	extractBearerToken,
	findSessionByTokenHash,
	findUserById,
	hashSessionToken,
	jsonResponse,
	publicUser,
	type SubscriptionRow,
} from "../../_shared/auth";

interface Env {
	DB: D1Database;
}

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
	const token = extractBearerToken(request);
	if (!token) return errorResponse("missing_token", 401);

	const tokenHash = await hashSessionToken(token);
	const session = await findSessionByTokenHash(env.DB, tokenHash);
	if (!session) return errorResponse("invalid_token", 401);

	const user = await findUserById(env.DB, session.user_id);
	if (!user) return errorResponse("invalid_token", 401);

	const subscription = await env.DB
		.prepare("SELECT * FROM subscriptions WHERE user_id = ?1 ORDER BY started_at DESC LIMIT 1")
		.bind(user.id)
		.first<SubscriptionRow>();

	return jsonResponse(
		{
			user: publicUser(user),
			subscription: subscription
				? {
						tier: subscription.tier,
						startedAt: subscription.started_at,
						expiresAt: subscription.expires_at,
					}
				: null,
		},
		200,
	);
};
