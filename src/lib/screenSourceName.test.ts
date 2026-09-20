import { describe, expect, it } from "vitest";
import { localizeScreenSourceName } from "./screenSourceName";

/** 记录 key→vars 的假翻译器：只认注册过的 key，其它退回 fallback 或 key 本身 */
function makeT(keys: Record<string, string>) {
	return (key: string, fallback?: string, vars?: Record<string, string | number>) => {
		const template = keys[key] ?? fallback ?? key;
		if (!vars) return template;
		return template.replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name] ?? `{{${name}}}`));
	};
}

const t = makeT({
	"recording.screenSourceName": "屏幕 {{n}}",
	"recording.screenSourcePrimary": "（主显示器）",
});

describe("localizeScreenSourceName", () => {
	it("translates generated screen names", () => {
		expect(localizeScreenSourceName("Screen 1", t)).toBe("屏幕 1");
		expect(localizeScreenSourceName("Screen 3", t)).toBe("屏幕 3");
	});

	it("translates the primary suffix", () => {
		expect(localizeScreenSourceName("Screen 1 (Primary)", t)).toBe("屏幕 1 （主显示器）");
	});

	it("passes through window titles untouched", () => {
		expect(localizeScreenSourceName("Chrome — GitHub", t)).toBe("Chrome — GitHub");
		expect(localizeScreenSourceName("", t)).toBe("");
	});

	it("passes through anything that is not our own naming scheme", () => {
		// 别的来源也叫 "Screen 1x" / "screen 1" —— 不是我们生成的，不动
		expect(localizeScreenSourceName("Screen 1x", t)).toBe("Screen 1x");
		expect(localizeScreenSourceName("screen 1", t)).toBe("screen 1");
		expect(localizeScreenSourceName("Screen 1 (Primary) extra", t)).toBe(
			"Screen 1 (Primary) extra",
		);
	});

	it("falls back to the English default when the locale pack lacks the key", () => {
		const bareT = makeT({});
		expect(localizeScreenSourceName("Screen 2", bareT)).toBe("Screen 2");
		expect(localizeScreenSourceName("Screen 2 (Primary)", bareT)).toBe("Screen 2 (Primary)");
	});
});
