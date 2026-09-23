/**
 * Kliq — Billing upgrade endpoint (§59-4)
 *
 * Receives a forwarded Waffo webhook from the Waffo Worker and upgrades the
 * matching D1 user to Lifetime. Called from `workers/waffo/src/index.ts`
 * handleWebhook() with `X-KLQ-Bridge-Secret` HMAC header.
 *
 * Auth model:
 *   - `X-KLQ-Bridge-Secret` must equal env.KLQ_BILLING_BRIDGE_SECRET (constant-time)
 *   - In dev/mock, secret may be empty (allows `wrangler dev` without env setup)
 *   - In production, secret is REQUIRED and must match
 *
 * Request body (forwarded from Worker):
 *   {
 *     event: "order.completed" | "subscription.activated" | "lifetime.purchased"
 *     plan: "lifetime"
 *     buyerEmail: string   ← must match a registered user
 *     sessionId?: string   ← Waffo session id (for idempotency)
 *     waffoSessionId?: string   ← preferred for idempotency
 *   }
 *
 * Response:
 *   200 { ok: true, subscriptionId, tier: "lifetime" }
 *   200 { ok: true, subscriptionId, tier: "lifetime", alreadyUpgraded: true }  ← idempotent retry
 *   400 { error: "..." }  ← validation failure
 *   401 / 403 { error: "..." }  ← bridge auth failure
 *   404 { error: "user_not_found" }  ← buyerEmail not in D1 users table
 *   500 { error: "internal" }  ← bridge secret not configured
 *
 * Reference: AGENTS.md §59-3 (Worker forward) / §59-4 (this endpoint).
 */

import type { PagesFunction } from "@cloudflare/workers-types";
import {
	jsonResponse,
	errorResponse,
	findUserByEmail,
	upgradeUserToLifetime,
	publicUser,
} from "../../_shared/auth";

interface Env {
	KLQ_BILLING_BRIDGE_SECRET?: string;
	DB: D1Database;
}

interface UpgradeRequestBody {
	event?: string;
	plan?: string;
	buyerEmail?: string;
	sessionId?: string;
	waffoSessionId?: string;
	[key: string]: unknown;
}

const UPGRADE_TRIGGERING_EVENTS = new Set([
	"order.completed",
	"subscription.activated",
	"lifetime.purchased",
]);

function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let mismatch = 0;
	for (let i = 0; i < a.length; i++) {
		mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return mismatch === 0;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
	const { request, env } = ctx;

	// Bridge auth — required so we always know the caller
	const headerSecret = request.headers.get("X-KLQ-Bridge-Secret") ?? "";
	const expected = env.KLQ_BILLING_BRIDGE_SECRET ?? "";

	if (!expected) {
		// No secret configured on the Pages Function. In production this means
		// a deploy forgot to set env.KLQ_BILLING_BRIDGE_SECRET — fail loudly.
		return errorResponse("bridge_secret_not_configured", 500);
	}
	if (!headerSecret) {
		return errorResponse("missing_bridge_secret", 401);
	}
	if (!constantTimeEqual(headerSecret, expected)) {
		return errorResponse("invalid_bridge_secret", 403);
	}

	// Content-Type must be JSON
	if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
		return errorResponse("bad_content_type", 415);
	}

	let body: UpgradeRequestBody;
	try {
		body = (await request.json()) as UpgradeRequestBody;
	} catch {
		return errorResponse("invalid_json", 400);
	}

	const event = body.event ?? "";
	const plan = body.plan ?? "";
	const buyerEmail = (body.buyerEmail ?? "").trim();
	const sessionId = body.waffoSessionId ?? body.sessionId ?? "";

	if (!UPGRADE_TRIGGERING_EVENTS.has(event)) {
		return jsonResponse(
			{ ok: false, error: "event_not_triggering", event },
			400,
		);
	}
	if (plan !== "lifetime") {
		return jsonResponse(
			{ ok: false, error: "plan_not_lifetime", plan },
			400,
		);
	}
	if (!buyerEmail) {
		return errorResponse("missing_buyer_email", 400);
	}
	if (!sessionId) {
		// sessionId is required for idempotency — without it a retry could insert
		// two subscription rows for the same purchase.
		return errorResponse("missing_session_id", 400);
	}

	// Look up user
	const userRow = await findUserByEmail(env.DB, buyerEmail);
	if (!userRow) {
		// Email was used at checkout but no registered account exists. The user
		// likely registered with a different email — 404 so the Worker knows to
		// surface "your Waffo email differs from your account email".
		return errorResponse("user_not_found", 404);
	}

	// Upgrade (idempotent on waffo_session_id)
	const result = await upgradeUserToLifetime(env.DB, buyerEmail, sessionId);

	// Read user back to confirm tier
	const updated = await findUserByEmail(env.DB, buyerEmail);

	return jsonResponse({
		ok: true,
		subscriptionId: result.subscriptionId,
		tier: result.tier,
		user: updated ? publicUser(updated) : null,
	});
};
