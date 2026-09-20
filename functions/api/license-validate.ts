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
 *     200 { valid: false, error }          ← 格式合法但被判定无效（含上游 404 = key 不存在）
 *     400 { valid: false, error }          ← body 缺 key / 前缀不对
 *     503                                   ← 上游 Lemon Squeezy 故障（客户端降级离线激活，不迁怒于 key）
 *
 * ⚠️ 为什么上游 404 必须转成 200 + valid:false：
 *   Lemon Squeezy 对「不存在的 key」返回 404。若把 404 原样透传，客户端会把
 *   404 解读为「校验端点未部署 → 离线激活」—— 于是任何伪造前缀的假 key 都能
 *   拿到 Pro（这个客户端回退是给「端点根本不存在」的场景留的，不是给
 *   「上游明确说不存在」留的）。两种 404 语义必须在这里分开。
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

		// 上游 404 / 400 = 对这把 key 的**确定性**判定（不存在 / 请求本身有问题）
		// → 200 + valid:false，客户端据此拒绝激活。绝不能透传 404，
		//   否则客户端的「端点缺失 → 离线激活」回退会把假 key 放行成 Pro。
		if (lsResponse.status === 404 || lsResponse.status === 400) {
			return jsonResponse({
				valid: false,
				error:
					lsResponse.status === 404
						? "License key not found"
						: `License key rejected by Lemon Squeezy (${errText.slice(0, 200)})`,
			});
		}

		// 其余（401/403 凭据问题、429 限流、5xx 故障）= 服务暂不可用，
		// 不是这把 key 的错 → 503，客户端降级离线激活而不是判 key 无效。
		return jsonResponse(
			{
				valid: false,
				error: `Lemon Squeezy API failed (${lsResponse.status})`,
				detail: errText.slice(0, 200),
			},
			503,
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
