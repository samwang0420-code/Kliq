import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	buildLicenseRequestMailto,
	getCommercialConfigStatus,
	getMissingBuildConfigKeys,
	KLQ_LICENSE_REQUEST_EMAIL,
} from "./licenseConfig";

/**
 * 落地页源码。
 *
 * 官网是纯静态 HTML，读不到任何构建期变量，所以它的「购买 / 取回密钥」
 * 渠道只能手写在 `cloudflare/pages/index.html` 里。也就是说**同一件事
 * 有两处真源**，而它们此前正好漂移过：官网让用户发邮件买，个人中心却
 * 只给了 Lemon Squeezy 订单页 —— 邮件下单的用户点过去只会看到
 * 「没有任何订单」。下面这几条断言就是钉住这个漂移的。
 */
const SITE_HTML = readFileSync(
	new URL("../../cloudflare/pages/index.html", import.meta.url),
	"utf8",
);

function siteConst(name: string): string | null {
	const m = new RegExp(`const\\s+${name}\\s*=\\s*'([^']*)'`).exec(SITE_HTML);
	return m ? m[1] : null;
}

describe("buildLicenseRequestMailto", () => {
	it("生成可用的 mailto 链接并带上人工联系邮箱", () => {
		const href = buildLicenseRequestMailto("purchase");
		expect(href.startsWith("mailto:")).toBe(true);
		expect(href).toContain(KLQ_LICENSE_REQUEST_EMAIL);
		expect(KLQ_LICENSE_REQUEST_EMAIL).toContain("@");
	});

	it("购买与找回用不同主题，便于收件箱分类", () => {
		const purchase = buildLicenseRequestMailto("purchase");
		const recover = buildLicenseRequestMailto("recover");
		expect(purchase).not.toBe(recover);
		expect(purchase).toContain(encodeURIComponent("Kliq Pro license request"));
		expect(recover).toContain(encodeURIComponent("Kliq Pro license recover"));
	});

	it("主题已转义，空格不会截断链接", () => {
		const href = buildLicenseRequestMailto("purchase");
		const subject = href.slice(href.indexOf("subject=") + "subject=".length);
		expect(subject).not.toContain(" ");
		expect(decodeURIComponent(subject)).toContain("Kliq Pro license request");
	});
});

describe("渠道一致性：应用 ↔ 落地页", () => {
	it("落地页的销售邮箱与应用内使用的是同一个", () => {
		const siteEmail = siteConst("KLQ_SALES_EMAIL");
		expect(siteEmail).not.toBeNull();
		expect(siteEmail).toBe(KLQ_LICENSE_REQUEST_EMAIL);
	});

	it("落地页至少有一个真实的购买入口（不是占位符）", () => {
		const ctas = SITE_HTML.match(/<a\b[^>]*\bdata-purchase-cta\b[^>]*>/g) ?? [];
		expect(ctas.length).toBeGreaterThan(0);
		for (const tag of ctas) {
			const href = /href="([^"]*)"/.exec(tag)?.[1] ?? "";
			expect(href.trim().length).toBeGreaterThan(0);
		}
	});

	it("落地页的结算页 / 订单页变量与个人中心文档里的变量名对得上", () => {
		// 未配置时为空串是预期状态（当前就是邮件下单），但变量必须存在，
		// 否则「填一个地址就切换渠道」这件事就没有落点。
		expect(siteConst("KLQ_CHECKOUT_URL")).not.toBeNull();
		expect(siteConst("KLQ_RECOVER_URL")).not.toBeNull();
	});
});

describe("getCommercialConfigStatus", () => {
	it("每一项都能说清「从哪里配」和「不配会怎样」", () => {
		const items = getCommercialConfigStatus();
		expect(items.length).toBeGreaterThan(0);
		for (const item of items) {
			expect(item.key).toMatch(/^[A-Z0-9_]+$/);
			expect(["build", "pages"]).toContain(item.scope);
			expect(item.effect.length).toBeGreaterThan(0);
		}
	});

	it("只有构建期变量能在应用内检测，服务端密钥一律返回 null（不假装知道）", () => {
		for (const item of getCommercialConfigStatus()) {
			if (item.scope === "build") expect(typeof item.set).toBe("boolean");
			else expect(item.set).toBeNull();
		}
	});

	it("缺失清单只包含确实检测为缺失的构建期变量", () => {
		const missing = getMissingBuildConfigKeys();
		const expected = getCommercialConfigStatus()
			.filter((i) => i.scope === "build" && i.set === false)
			.map((i) => i.key);
		expect(missing).toEqual(expected);
		expect(missing.every((k) => k.startsWith("VITE_"))).toBe(true);
	});
});
