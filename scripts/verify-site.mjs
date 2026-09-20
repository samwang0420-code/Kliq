#!/usr/bin/env node
/**
 * Kliq — 落地页静态校验（cloudflare/pages/index.html）
 *
 * 为什么需要它
 * ------------
 * 官网是**手写单文件 HTML**：文案靠 `data-bind="x"` 属性 + 内嵌 I18N 表驱动，
 * 没有任何构建期校验。这带来三类此前真实发生过、且**肉眼看不出来**的缺陷：
 *
 *   1. 有 `data-bind="x"` 但 I18N 里没有 `x` → 该处文字永远停在硬编码的那一份，
 *      切语言时它不动（其余段落都变了，唯独它不变 —— 只有逐字读才会发现）。
 *   2. 有 `x` 在 I18N 里，但 `map` 里漏了 → 同上，静态看代码"什么都有"。
 *   3. 购买按钮的 href 被写成占位符/空串 → 收费链路在**最外层**断掉，
 *      而应用内一切正常，排查时根本不会往官网看。
 *
 * 另外校验结构化数据里的**虚构字段**：曾出现 `aggregateRating`
 * （4.9 分 / 127 条评价），而产品当时尚无用户。Google 对自评式的
 * 假评分标记有明确处罚口径（Structured Data Spam），属于要主动删掉的东西。
 *
 * 用法
 * ----
 *   node scripts/verify-site.mjs            # 校验真实文件
 *   node scripts/verify-site.mjs --json     # 机器可读
 *   node scripts/verify-site.mjs --self-test  # 反证：故意注入缺陷，校验器必须报错
 *
 * 边界（诚实声明）
 * ----------------
 * 这是**静态**校验：它证明「绑定齐全、链接非空、标记无虚构评分」，
 * 不能证明文案得体、排版正确、购买渠道确实可用。渠道可用性靠人点一次。
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_DIR = path.join(ROOT, "cloudflare/pages");
const SITE_PATH = path.join(SITE_DIR, "index.html");

/** 本站自有域名：结构化数据里的 url 必须落在它下面 */
const OWN_HOST = "yanjingai.tech";

/**
 * 把一段位于 `{ ... }` 内部的对象体按顶层逗号切开。
 *
 * 朴素正则会在「值里包含 `key: 'x'` 字样」或字符串里含逗号时出错，
 * 所以这里带引号/括号状态机走一遍，是判断绑定是否齐全的前提。
 */
function splitTopLevel(body) {
	const parts = [];
	let cur = "";
	let quote = null;
	let depth = 0;
	for (let i = 0; i < body.length; i += 1) {
		const c = body[i];
		if (quote) {
			cur += c;
			if (c === quote && body[i - 1] !== "\\") quote = null;
			continue;
		}
		if (c === '"' || c === "'" || c === "`") {
			quote = c;
			cur += c;
			continue;
		}
		if (c === "{" || c === "[") depth += 1;
		else if (c === "}" || c === "]") depth -= 1;
		else if (c === "," && depth === 0) {
			parts.push(cur);
			cur = "";
			continue;
		}
		cur += c;
	}
	if (cur.trim()) parts.push(cur);
	return parts;
}

/** 从对象体里取出键名（保持出现顺序，去掉重复）。键可能带引号（map 就是 'a':'a' 写法） */
function keysOf(body) {
	const seen = new Set();
	for (const part of splitTopLevel(body)) {
		const m = /^\s*['"`]?([A-Za-z_][A-Za-z0-9_]*)['"`]?\s*:/.exec(part);
		if (m) seen.add(m[1]);
	}
	return [...seen];
}

/** 取出内嵌 <script> 之外的标记部分 —— 否则脚本里的字符串会被误当属性 */
function stripScripts(html) {
	return html.replace(/<script[\s\S]*?<\/script>/gi, "");
}

function extractDict(scriptBody, lang, terminator) {
	const re = new RegExp(`\\n\\s{4}${lang}:\\s*\\{([\\s\\S]*?)${terminator}`);
	const m = re.exec(scriptBody);
	return m ? keysOf(m[1]) : null;
}

function extractMap(scriptBody) {
	const m = /const map = \{([\s\S]*?)\n\s{4}\};/.exec(scriptBody);
	return m ? keysOf(m[1]) : null;
}

function extractJsonLd(html) {
	const out = [];
	const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
	let m = re.exec(html);
	while (m) {
		out.push(m[1]);
		m = re.exec(html);
	}
	return out;
}

/** 取出所有带某属性的标签片段（用于检查 href 是否为空） */
function tagsWithAttr(markup, attr) {
	const out = [];
	const re = new RegExp(`<a\\b[^>]*\\b${attr}\\b[^>]*>`, "gi");
	let m = re.exec(markup);
	while (m) {
		out.push(m[0]);
		m = re.exec(markup);
	}
	return out;
}

/**
 * 去掉 JS 注释，用于判断「某函数到底有没有被真正调用」。
 *
 * 不这么做的话，把调用整行改成注释后，朴素正则仍会判为「已调用」——
 * 而这恰恰是本脚本最想抓的「写了但没接上」。
 * 行注释只在前面不是 `:` 时才当注释，免得把 `https://` 里的 `//` 当成注释起点。
 */
function stripComments(code) {
	return code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:'"`])\/\/[^\n]*/g, "$1");
}

/**
 * 核心校验。返回 findings 列表（level: "error" | "warn"）。
 * 抽成纯函数是为了 --self-test 能对着注入缺陷的副本跑同一套逻辑。
 *
 * @param html                页面全文
 * @param options.label       出错信息里用的页面名
 * @param options.requirePurchaseEntry
 *        是否强制「页面上必须有可用购买入口」。默认 true；仅当页面自己声明了
 *        定价区（`id="pricing"`）时才要求 —— 退款政策页没有定价区，不该因此报错。
 */
export function checkSite(html, options = {}) {
	const label = options.label ?? "index.html";
	const requirePurchaseEntry = options.requirePurchaseEntry !== false;
	const findings = [];
	const fail = (code, message) => findings.push({ level: "error", code, message, label });
	const warn = (code, message) => findings.push({ level: "warn", code, message, label });

	const scriptMatch = /<script>([\s\S]*)<\/script>\s*<\/body>/.exec(html);
	if (!scriptMatch) {
		fail("no-inline-script", "找不到内嵌脚本（I18N 表所在处）");
		return findings;
	}
	const scriptBody = scriptMatch[1];
	const markup = stripScripts(html);

	// ---------- 0. 内嵌脚本必须能编译 ----------
	// 整页的文案渲染与购买链接都挂在这一段脚本上：一个语法错误会让
	// 「切语言」和「购买按钮指向」同时失效，而页面本身仍长得像正常页面。
	try {
		// 只编译不执行：这里要的是「语法是否成立」，不是运行页面脚本。
		new Function(scriptBody);
	} catch (e) {
		fail("script-syntax", `内嵌脚本无法编译（整页文案与购买链接都会失效）：${e.message}`);
	}

	// ---------- 1. 内嵌 I18N 表 ----------
	const en = extractDict(scriptBody, "en", "\\n\\s{4}\\},");
	const zh = extractDict(scriptBody, "zh", "\\n\\s{4}\\}\\s*\\n\\s{2}\\};");
	const map = extractMap(scriptBody);
	// 两种绑定写法都合法：index.html 维护一份显式 map，refund.html 直接遍历
	// 文案表的键。两者至少有其一，否则整页文字根本不会被写进 DOM。
	const iteratesDict = /Object\.keys\(\s*d\s*\)/.test(stripComments(scriptBody));
	if (!en) fail("no-en-dict", "找不到 en 文案表");
	if (!zh) fail("no-zh-dict", "找不到 zh 文案表");
	if (!map && !iteratesDict) {
		fail(
			"no-bind-map",
			"既没有 data-bind → 文案表的映射 (map)，也没有遍历文案表的写入逻辑",
		);
	}
	if (!en || !zh) return findings;

	const binds = [...new Set([...markup.matchAll(/data-bind="([^"]+)"/g)].map((m) => m[1]))];

	// 两个语言的键必须完全一致，否则切到某语言会露出另一种语言的原文
	const enSet = new Set(en);
	const zhSet = new Set(zh);
	for (const k of en) {
		if (!zhSet.has(k))
			fail("lang-key-missing-zh", `en 有 "${k}"，zh 没有 → 中文界面该处会显示英文`);
	}
	for (const k of zh) {
		if (!enSet.has(k))
			fail("lang-key-missing-en", `zh 有 "${k}"，en 没有 → 英文界面该处会显示中文`);
	}

	const mapSet = new Set(map ?? []);
	const bindSet = new Set(binds);
	for (const b of binds) {
		if (!enSet.has(b))
			fail("bind-untranslated", `HTML 用了 data-bind="${b}"，但 en 文案表里没有这个键`);
		if (!zhSet.has(b))
			fail("bind-untranslated-zh", `HTML 用了 data-bind="${b}"，但 zh 文案表里没有这个键`);
		if (map && !mapSet.has(b)) {
			fail(
				"bind-not-in-map",
				`data-bind="${b}" 没被登记进 map → 切换语言时它不会更新（其余文字都变了，只有它不动）`,
			);
		}
	}
	for (const k of map ?? []) {
		if (!bindSet.has(k)) warn("stale-map-entry", `map 里的 "${k}" 在 HTML 里没有任何元素使用`);
	}
	for (const k of en) {
		if (!bindSet.has(k)) warn("unused-string", `文案表里的 "${k}" 没有被任何元素使用`);
	}

	// ---------- 2. 购买链路（仅对声明了定价区的页面强制） ----------
	if (!requirePurchaseEntry) return findings;

	const purchaseCtas = tagsWithAttr(markup, "data-purchase-cta");
	if (requirePurchaseEntry && purchaseCtas.length === 0) {
		fail(
			"no-purchase-cta",
			"页面上没有任何 data-purchase-cta 标记的购买入口 → 访客看完没有地方付钱",
		);
	}
	for (const tag of purchaseCtas) {
		const m = /\bhref="([^"]*)"/.exec(tag);
		if (!m || !m[1].trim()) {
			fail("purchase-cta-no-href", `购买按钮没有可用 href：${tag.slice(0, 120)}`);
		}
	}

	if (!/\bKLQ_CHECKOUT_URL\b/.test(scriptBody)) {
		fail("no-checkout-const", "脚本里找不到 KLQ_CHECKOUT_URL 常量（结算页地址的唯一真源）");
	}
	if (!/\bKLQ_RECOVER_URL\b/.test(scriptBody)) {
		fail(
			"no-recover-const",
			"脚本里找不到 KLQ_RECOVER_URL 常量（顾客自助取回 license key 的入口）",
		);
	}
	if (!/\bdata-bind="pr_recover"/.test(markup)) {
		fail(
			"no-recover-entry",
			'页面缺少「已购买？取回 license key」入口（data-bind="pr_recover"）→ key 邮件丢了就没救了',
		);
	}
	const code = stripComments(scriptBody);
	const hasApply = /function\s+applyPurchaseLinks\s*\(/.test(code);
	// 注意「调用」必须以 `;` 结尾来识别：函数定义 `function applyPurchaseLinks() {`
	// 里也含 `applyPurchaseLinks()`，只按括号匹配会把定义误判成调用。
	const hasApplyCall = /\bapplyPurchaseLinks\(\)\s*;/.test(code);
	if (!hasApply)
		fail("no-apply-purchase-links", "找不到 applyPurchaseLinks()，购买按钮不会随配置切换渠道");
	if (!hasApplyCall)
		fail("apply-not-called", "applyPurchaseLinks() 定义了却没被调用（典型的「写了但没接上」）");

	// ---------- 3. 结构化数据 ----------
	for (const [i, block] of extractJsonLd(html).entries()) {
		let data;
		try {
			data = JSON.parse(block);
		} catch (e) {
			fail(
				"jsonld-invalid",
				`第 ${i + 1} 块 application/ld+json 不是合法 JSON：${e.message}`,
			);
			continue;
		}
		if (data.aggregateRating) {
			fail(
				"jsonld-fake-rating",
				`第 ${i + 1} 块含 aggregateRating（${JSON.stringify(data.aggregateRating)}）—— 尚无真实评价数据时这是虚构标记，违反 Google 结构化数据政策`,
			);
		}
		const offers = data.offers;
		if (offers && typeof offers.url === "string") {
			if (!offers.url.startsWith("https://")) {
				fail("jsonld-offer-url", `offers.url 不是 https 地址（${offers.url}）`);
			} else if (!offers.url.includes(OWN_HOST)) {
				fail("jsonld-offer-url-host", `offers.url 指向非自有域名（${offers.url}）`);
			}
			if (offers.url.startsWith("mailto:")) {
				fail(
					"jsonld-offer-mailto",
					"offers.url 是 mailto —— 结构化数据里应给可访问的商品/定价页地址",
				);
			}
		}
	}

	return findings;
}

/** 落地页目录下的全部页面（每个页面都有自己的内嵌文案表） */
function sitePages() {
	return readdirSync(SITE_DIR)
		.filter((name) => name.endsWith(".html"))
		.sort()
		.map((name) => ({ label: name, path: path.join(SITE_DIR, name) }));
}

function main() {
	const args = process.argv.slice(2);
	const asJson = args.includes("--json");
	const selfTest = args.includes("--self-test");

	const html = readFileSync(SITE_PATH, "utf8");
	const findings = selfTest
		? checkSite(html)
		: sitePages().flatMap(({ label, path: file }) => {
				const page = readFileSync(file, "utf8");
				return checkSite(page, {
					label,
					requirePurchaseEntry: /id="pricing"/.test(page),
				});
			});
	const errors = findings.filter((f) => f.level === "error");

	if (selfTest) {
		const mutations = [
			{
				name: "删掉 zh 文案表里的一个键",
				mutate: (s) =>
					s.replace(
						"\n      pr_pro_cta: '购买 Pro",
						"\n      pr_pro_cta_renamed: '购买 Pro",
					),
				expectCode: "lang-key-missing-en",
			},
			{
				name: "从 map 里摘掉一个绑定",
				mutate: (s) =>
					s.replace("'pr_pro_cta':'pr_pro_cta'", "'pr_pro_cta_X':'pr_pro_cta'"),
				expectCode: "bind-not-in-map",
			},
			{
				name: "把购买按钮的 href 清空",
				mutate: (s) =>
					s.replace(
						/href="mailto:sam\.wang01@icloud\.com\?subject=Kliq%20Pro%20license%20request" data-bind="pr_pro_cta" data-purchase-cta/,
						'href="" data-bind="pr_pro_cta" data-purchase-cta',
					),
				expectCode: "purchase-cta-no-href",
			},
			{
				name: "重新塞回虚构评分",
				mutate: (s) =>
					s.replace(
						/\n(\s*)"author": \{/,
						'\n$1"aggregateRating": { "@type": "AggregateRating", "ratingValue": "5.0", "ratingCount": "999" },\n$1"author": {',
					),
				expectCode: "jsonld-fake-rating",
			},
			{
				name: "注释掉 applyPurchaseLinks() 的调用",
				mutate: (s) =>
					s.replace("    applyPurchaseLinks();", "    /* applyPurchaseLinks(); */"),
				expectCode: "apply-not-called",
			},
			{
				name: "内嵌脚本写入语法错误",
				mutate: (s) => s.replace("  function initLang() {", "  function initLang( {"),
				expectCode: "script-syntax",
			},
		];

		let ok = 0;
		for (const m of mutations) {
			const mutated = m.mutate(html);
			if (mutated === html) {
				console.error(`✗ 自检「${m.name}」未能改动源文件（锚点失效，需更新本脚本）`);
				process.exitCode = 1;
				continue;
			}
			const codes = new Set(checkSite(mutated).map((f) => f.code));
			if (codes.has(m.expectCode)) {
				ok += 1;
				console.log(`✓ 自检捕获「${m.name}」→ ${m.expectCode}`);
			} else {
				console.error(
					`✗ 自检漏报「${m.name}」：期望 ${m.expectCode}，实际 ${[...codes].join(", ") || "无"}`,
				);
				process.exitCode = 1;
			}
		}
		console.log(`\n自检通过 ${ok}/${mutations.length}`);
		return;
	}

	if (asJson) {
		console.log(JSON.stringify({ site: SITE_DIR, findings }, null, "\t"));
	} else {
		for (const f of findings) {
			console.log(`${f.level === "error" ? "✗" : "!"} [${f.label}::${f.code}] ${f.message}`);
		}
		if (findings.length === 0) {
			const names = sitePages().map((p) => p.label).join(", ");
			console.log(`✓ 落地页静态校验通过（${names}）`);
		}
	}

	if (errors.length > 0) {
		if (!asJson) console.log(`\n${errors.length} 处错误`);
		process.exitCode = 1;
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main();
}
