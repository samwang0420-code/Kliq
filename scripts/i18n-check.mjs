import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const localesDir = path.join(root, "src", "i18n", "locales");
const configPath = path.join(root, "src", "i18n", "config.ts");

/**
 * 语言列表以 src/i18n/config.ts 的 SUPPORTED_LOCALES 为准，而不是扫目录。
 * 原因：仓库里可能残留不再注册的语言目录（例如只有 common.json 的半成品），
 * 它们不会进入运行时，却会让本检查产生假阳性失败。漏检真正的注册语言才是本
 * 脚本要防的事，所以这里做双向校验：注册语言必须有目录，目录必须已被注册。
 */
function readSupportedLocales() {
	const source = fs.readFileSync(configPath, "utf8");
	const block = source.match(/SUPPORTED_LOCALES\s*=\s*\[([\s\S]*?)\]\s*as const/);
	if (!block) {
		throw new Error("i18n-check: unable to parse SUPPORTED_LOCALES from src/i18n/config.ts");
	}
	return [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

const locales = readSupportedLocales().sort((left, right) => left.localeCompare(right));

if (!locales.includes("en")) {
	console.error('i18n-check: expected "en" to be a registered locale');
	process.exit(1);
}

// 目录存在但未注册 → 提示，不视为失败（其内容不会进入运行时）
const registered = new Set(locales);
const orphanDirs = fs
	.readdirSync(localesDir)
	.filter((entry) => fs.statSync(path.join(localesDir, entry)).isDirectory())
	.filter((entry) => !registered.has(entry))
	.sort();
for (const orphan of orphanDirs) {
	console.warn(
		`i18n-check: warning — directory ${orphan}/ exists but is not in SUPPORTED_LOCALES (ignored)`,
	);
}

function loadJson(filePath) {
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf8"));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`i18n-check: failed to load ${path.relative(root, filePath)}: ${message}`);
	}
}

function collectKeyPaths(obj, prefix = "") {
	if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
		return prefix ? [prefix] : [];
	}

	const keys = Object.keys(obj);
	if (keys.length === 0) {
		return prefix ? [prefix] : [];
	}

	const paths = [];
	for (const key of keys) {
		const nextPrefix = prefix ? `${prefix}.${key}` : key;
		const value = obj[key];
		if (value && typeof value === "object" && !Array.isArray(value)) {
			paths.push(...collectKeyPaths(value, nextPrefix));
		} else {
			paths.push(nextPrefix);
		}
	}
	return paths;
}

const baseLocaleDir = path.join(localesDir, "en");
const namespaceFiles = fs
	.readdirSync(baseLocaleDir)
	.filter((file) => file.endsWith(".json"))
	.sort((left, right) => left.localeCompare(right));

let hasErrors = false;

for (const namespaceFile of namespaceFiles) {
	const baseData = loadJson(path.join(baseLocaleDir, namespaceFile));
	const baseKeys = new Set(collectKeyPaths(baseData));

	for (const locale of locales) {
		if (locale === "en") continue;

		const localeFile = path.join(localesDir, locale, namespaceFile);
		if (!fs.existsSync(localeFile)) {
			console.error(`i18n-check: missing namespace file ${locale}/${namespaceFile}`);
			hasErrors = true;
			continue;
		}

		const localeData = loadJson(localeFile);
		const localeKeys = new Set(collectKeyPaths(localeData));

		for (const key of baseKeys) {
			if (!localeKeys.has(key)) {
				console.error(`i18n-check: missing key ${locale}/${namespaceFile}:${key}`);
				hasErrors = true;
			}
		}

		for (const key of localeKeys) {
			if (!baseKeys.has(key)) {
				console.error(`i18n-check: extra key ${locale}/${namespaceFile}:${key}`);
				hasErrors = true;
			}
		}
	}
}

if (hasErrors) {
	process.exit(1);
}

console.log("i18n-check: locale files are structurally consistent");
