import { describe, expect, it } from "vitest";
import { filterVisibleKeystrokes, type KeystrokeOverlayEvent } from "./KeystrokeOverlay.helpers";

function evt(timeMs: number, key: string): KeystrokeOverlayEvent {
	return { timeMs, key, keycode: 0, hasModifier: false, isShortcut: false };
}

describe("filterVisibleKeystrokes", () => {
	it("returns only events inside the [currentTime - displayDuration, currentTime] window", () => {
		const events = [
			evt(0, "TooEarly"),
			evt(100, "InWindow1"),
			evt(500, "InWindow2"),
			evt(1000, "Boundary"),
			evt(2000, "InFuture"),
		];
		const visible = filterVisibleKeystrokes(events, 1000, 1000);
		expect(visible.map((e) => e.key)).toEqual(["InWindow1", "InWindow2", "Boundary"]);
	});

	it("respects maxPills by trimming the tail (oldest first)", () => {
		const events = [evt(100, "A"), evt(200, "B"), evt(300, "C"), evt(400, "D")];
		const visible = filterVisibleKeystrokes(events, 400, 1000, 2);
		expect(visible.map((e) => e.key)).toEqual(["C", "D"]);
	});

	it("returns an empty list when no events fall inside the window", () => {
		expect(filterVisibleKeystrokes([], 1000, 1000)).toEqual([]);
		expect(filterVisibleKeystrokes([evt(5000, "Late")], 1000, 1000)).toEqual([]);
	});

	it("treats negative time differences (seek backward) as a fully-empty window", () => {
		expect(filterVisibleKeystrokes([evt(500, "X")], 100, 1000)).toEqual([]);
	});

	it("filters out future events even when currentTime is positive", () => {
		const events = [evt(2000, "future")];
		expect(filterVisibleKeystrokes(events, 1000, 1000)).toEqual([]);
	});
});
