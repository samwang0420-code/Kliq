/**
 * 言镜 — Lemon Squeezy 许可证在线校验 API
 *
 * 部署目标: Cloudflare Pages Function (yanjingai.tech/api/license/validate)
 *
 * 流程:
 * 1. 客户端 POST { licenseKey }
 * 2. Cloudflare Function 调 Lemon Squeezy Validate API
 * 3. 返回 { valid: boolean, expiresAt: number, instanceId: string }
 *
 * Stage 6 落地版本 (骨架):
 * - 函数已写好, 实际部署在 Stage 7 (Cloudflare Pages deploy)
 * - 需要 LEMON_SQUEEZY_API_KEY + LEMON_SQUEEZY_STORE + LEMON_SQUEEZY_PRODUCT_ID env vars
 * - 详见 .env.example
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

const jsonResponse = (data: unknown, status = 200): Response => {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json" },
	});
};

export const onRequestPost = async ({
	request,
	env,
}: { request: Request; env: Env }): Promise<Response> => {
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

	if (!licenseKey.startsWith("yanjing-pro-")) {
		return jsonResponse({ valid: false, error: "Invalid license key prefix" }, 400);
	}

	// Stage 7 实施: 调 Lemon Squeezy Validate API
	// 文档: https://docs.lemonsqueezy.com/api/license-keys#validate-a-license-key
	const lsResponse = await fetch("https://api.lemonsqueezy.com/v1/licenses/validate", {
		method: "POST",
		headers: {
			"Accept": "application/json",
			"Content-Type": "application/json",
			"Authorization": `Bearer ${env.LEMON_SQUEEZY_API_KEY}`,
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
		return jsonResponse({
			valid: false,
			error: `Lemon Squeezy API failed (${lsResponse.status})`,
			detail: errText.slice(0, 200),
		}, lsResponse.status);
	}

	const data = (await lsResponse.json()) as {
		valid?: boolean;
		license_key?: { expires_at?: string | null; instance?: { id?: string } };
	};

	return jsonResponse({
		valid: data.valid ?? false,
		expiresAt: data.license_key?.expires_at ? new Date(data.license_key.expires_at).getTime() : null,
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
