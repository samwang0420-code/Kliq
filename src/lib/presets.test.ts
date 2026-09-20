import { describe, expect, it } from "vitest";
import type { HotwordDomain } from "./hotwords";
import { PLATFORM_PRESETS, SCENARIO_TEMPLATES } from "./presets";

/**
 * 场景模板 / 平台预设的数据完整性守卫。
 *
 * 这两个常量表在 2026-09-18 就写好了，但直到 2026-09-20 才第一次被 UI 真正消费
 * （此前是「列表注册」= 写了没接上）。这条测试保证：以后往表里加场景/平台时，
 * 推荐热词域必须合法、尺寸/帧率必须是正数——否则接线处会静默渲染出无效选项。
 */

const VALID_DOMAINS: readonly HotwordDomain[] = [
	"general",
	"legal",
	"medical",
	"ecommerce",
	"education",
	"finance",
	"gaming",
	"tech",
	"marketing",
];

describe("SCENARIO_TEMPLATES", () => {
	const scenarios = Object.values(SCENARIO_TEMPLATES);

	it("exposes exactly the five shipped scenarios", () => {
		expect(scenarios).toHaveLength(5);
		expect(new Set(scenarios.map((s) => s.id)).size).toBe(5);
	});

	it("recommends a valid hotword domain for every scenario", () => {
		for (const s of scenarios) {
			expect(
				VALID_DOMAINS.includes(s.recommendedHotwordDomain),
				`${s.id} 推荐了不存在的热词域 ${s.recommendedHotwordDomain}`,
			).toBe(true);
		}
	});

	it("carries positive numeric recommendations for every scenario", () => {
		for (const s of scenarios) {
			expect(s.recommendedFps, s.id).toBeGreaterThan(0);
			expect(s.recommendedCrop.width, s.id).toBeGreaterThan(0);
			expect(s.recommendedCrop.height, s.id).toBeGreaterThan(0);
			if (s.recommendedMaxDurationMs !== undefined) {
				expect(s.recommendedMaxDurationMs, s.id).toBeGreaterThan(0);
			}
		}
	});

	it("always names the scenario in both languages", () => {
		for (const s of scenarios) {
			expect(s.name.length, s.id).toBeGreaterThan(0);
			expect(s.nameEn.length, s.id).toBeGreaterThan(0);
			expect(s.features.length, s.id).toBeGreaterThan(0);
		}
	});
});

describe("PLATFORM_PRESETS", () => {
	const presets = Object.values(PLATFORM_PRESETS);

	it("exposes five platform presets with unique ids", () => {
		expect(presets).toHaveLength(5);
		expect(new Set(presets.map((p) => p.id)).size).toBe(5);
	});

	it("carries positive dimensions and a matching aspect ratio string", () => {
		for (const p of presets) {
			expect(p.width, p.id).toBeGreaterThan(0);
			expect(p.height, p.id).toBeGreaterThan(0);
			expect(p.aspectRatio, p.id).toMatch(/^\d+:\d+$/);
			const [w, h] = p.aspectRatio.split(":").map(Number);
			// 宽高比字符串要与实际尺寸同比例（允许 ±1px 的取整误差）
			expect(p.width / p.height).toBeCloseTo(w / h, 1);
		}
	});
});
