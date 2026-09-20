/**
 * Kliq — Lemon Squeezy 许可证在线校验 API
 *
 * 部署目标: Cloudflare Pages Function
 *   文件路径 functions/api/license-validate.ts → 路由 /api/license-validate
 *   客户端调用点见 src/lib/licenseConfig.ts（KLQ_LICENSE_VALIDATE_URL）
 *
 * 契约（必须与 src/lib/license.ts → ServerValidation 一致）:
 *   POST { licenseKey } →
 *     200 { valid: true,  activatedAt, expiresAt, instanceId }
 *     200 { valid: false, error }          ← 格式合法但被判定无效
 *     400 { valid: false, error }          ← body 缺 key / 前缀不对
 *     404                                   ← 该 key 未登记（客户端回退离线激活）
 *
 * 注意: 客户端**同时**看 HTTP 状态与 `valid` 字段。判定无效时即使返回 200 也必须
 * 带 `valid: false`，否则无效 key 会被当成激活成功。
 *
 * 所需环境变量: LEMON_SQUEEZY_API_KEY / LEMON_SQUEEZY_STORE / LEMON_SQUEEZY_PRODUCT_ID
 */

interface Env {
	LEMON_SQUEEZY_API_KEY: string;
	LEMON_SQUEEZY_STORE: string;
	LEMON_SQUEEZY_PRODUCT_ID: string;
}

type LicenseKeyBody = {
	licenseKey?: unknown;
	instanceId?: unknown;
};

/** 现行前缀 + 改名前的旧前缀（老客户手上的 key 仍需可激活） */
const ACCEPTED_KEY_PREFIXES = ["kliq-pro-", "yanjing-pro-"];

const jsonResponse = (data: unknown, status = 200): Response => {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json" },
	});
};

export const onRequestPost = async ({
	request,
	env,
}: {
	request: Request;
	env: Env;
}): Promise<Response> => {
	let body: LicenseKeyBody;
	try {
		body = (await request.json()) as LicenseKeyBody;
	} catch {
		return jsonResponse({ valid: false, error: "Invalid JSON body" }, 400);
	}

	const licenseKey = typeof body.licenseKey === "string" ? body.licenseKey.trim() : "";
	const instanceId = typeof body.instanceId === "string" ? body.instanceId : "";

	if (!licenseKey) {
		return jsonResponse({ valid: false, error: "Missing licenseKey" }, 400);
	}

	if (!ACCEPTED_KEY_PREFIXES.some((prefix) => licenseKey.startsWith(prefix))) {
		return jsonResponse({ valid: false, error: "Invalid license key prefix" }, 400);
	}

	// 调 Lemon Squeezy Validate API
	// 文档: https://docs.lemonsqueezy.com/api/license-keys#validate-a-license-key
	const lsResponse = await fetch("https://api.lemonsqueezy.com/v1/licenses/validate", {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
			Authorization: `Bearer ${env.LEMON_SQUEEZY_API_KEY}`,
		},
		body: JSON.stringify({
			license_key: licenseKey,
			instance_id: instanceId || undefined,
			store_id: env.LEMON_SQUEEZY_STORE,
			product_id: env.LEMON_SQUEEZY_PRODUCT_ID,
		}),
	});

	if (!lsResponse.ok) {
		const errText = await lsResponse.text();
		return jsonResponse(
			{
				valid: false,
				error: `Lemon Squeezy API failed (${lsResponse.status})`,
				detail: errText.slice(0, 200),
			},
			lsResponse.status,
		);
	}

	const data = (await lsResponse.json()) as {
		valid?: boolean;
		error?: string | null;
		license_key?: {
			created_at?: string | null;
			expires_at?: string | null;
			instance?: { id?: string };
		};
	};

	if (data.valid !== true) {
		// 格式合法但被上游判定无效 —— 200 + valid:false 是刻意的，客户端据此拒绝激活
		return jsonResponse({ valid: false, error: data.error ?? "License key not valid" });
	}

	return jsonResponse({
		valid: true,
		// 一次性买断：expires_at 为 null 即永久有效，客户端据此不展示到期时间
		expiresAt: data.license_key?.expires_at
			? new Date(data.license_key.expires_at).getTime()
			: null,
		activatedAt: data.license_key?.created_at
			? new Date(data.license_key.created_at).getTime()
			: null,
		instanceId: data.license_key?.instance?.id ?? null,
	});
};

export const onRequestOptions = async (): Promise<Response> => {
	return new Response(null, {
		status: 204,
		headers: {
			"access-control-allow-origin": "*",
			"access-control-allow-methods": "POST, OPTIONS",
			"access-control-allow-headers": "content-type",
		},
	});
};
