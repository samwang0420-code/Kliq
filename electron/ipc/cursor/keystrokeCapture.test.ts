import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
	app: { getPath: () => "/tmp" },
}));

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	getKeystrokeEventsBuffer,
	setKeystrokeCaptureAccumulatedPausedMs,
	setKeystrokeCaptureMode,
	setKeystrokeCapturePauseStartedAtMs,
	setKeystrokeCaptureStartedAtMs,
	setKeystrokeEventsBuffer,
} from "../state";
import {
	getKeystrokeEventsSnapshot,
	getKeystrokeTelemetryPath,
	hasModifier,
	isShortcutCombination,
	KEYSTROKE_TELEMETRY_VERSION,
	normalizeKeystrokeLabel,
	readKeystrokeTelemetry,
	writeKeystrokeTelemetry,
} from "./keystrokeCapture";

const fixturesDir = path.join(os.tmpdir(), "yanjing-keystroke-test");
let sampleVideoPath = "";

beforeEach(async () => {
	sampleVideoPath = path.join(fixturesDir, `${Date.now()}-${Math.random()}.mp4`);
	await fs.mkdir(fixturesDir, { recursive: true });
	await fs.writeFile(sampleVideoPath, "");
	setKeystrokeEventsBuffer([]);
	setKeystrokeCaptureStartedAtMs(Date.now() - 1000);
	setKeystrokeCaptureAccumulatedPausedMs(0);
	setKeystrokeCapturePauseStartedAtMs(null);
	setKeystrokeCaptureMode("shortcuts-only");
});

afterEach(async () => {
	try {
		await fs.rm(fixturesDir, { recursive: true, force: true });
	} catch {
		// ignore
	}
});

describe("normalizeKeystrokeLabel", () => {
	it("emits bare letters in upper case", () => {
		expect(normalizeKeystrokeLabel({ key: "a" })).toBe("A");
	});

	it("prefixes Shift for letter keys too (lets users distinguish the source)", () => {
		expect(normalizeKeystrokeLabel({ key: "a", shiftKey: true })).toBe("Shift+A");
	});

	it("prefixes modifiers in canonical order Ctrl/Meta/Alt/Shift", () => {
		expect(
			normalizeKeystrokeLabel({
				key: "P",
				ctrlKey: true,
				shiftKey: true,
				metaKey: true,
			}),
		).toBe("Ctrl+Cmd+Shift+P");
	});

	it("uses Cmd on macOS and Meta elsewhere", () => {
		const origPlatform = process.platform;
		Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
		expect(normalizeKeystrokeLabel({ key: "q", metaKey: true })).toBe("Cmd+Q");
		Object.defineProperty(process, "platform", { value: "linux", configurable: true });
		expect(normalizeKeystrokeLabel({ key: "q", metaKey: true })).toBe("Meta+Q");
		Object.defineProperty(process, "platform", { value: origPlatform, configurable: true });
	});

	it("falls back to Key<code> when no key string is provided", () => {
		expect(normalizeKeystrokeLabel({ keycode: 42 })).toBe("Key42");
	});

	it("keeps named keys like Enter / ArrowUp unchanged", () => {
		expect(normalizeKeystrokeLabel({ key: "Enter" })).toBe("Enter");
		expect(normalizeKeystrokeLabel({ key: "ArrowUp" })).toBe("ArrowUp");
	});

	it("reads fields from nested data shape (uiohook dual API)", () => {
		expect(
			normalizeKeystrokeLabel({
				data: { key: "c", ctrlKey: true },
			}),
		).toBe("Ctrl+C");
	});

	it("treats Space as the literal token", () => {
		expect(normalizeKeystrokeLabel({ key: " " })).toBe("Space");
	});
});

describe("hasModifier / isShortcutCombination", () => {
	it("hasModifier returns true for any modifier key", () => {
		expect(hasModifier({ ctrlKey: true })).toBe(true);
		expect(hasModifier({ metaKey: true })).toBe(true);
		expect(hasModifier({ altKey: true })).toBe(true);
		expect(hasModifier({ shiftKey: true })).toBe(true);
	});

	it("hasModifier returns false for plain keys", () => {
		expect(hasModifier({ key: "a" })).toBe(false);
	});

	it("isShortcutCombination requires ctrl/meta/alt plus a non-modifier key", () => {
		expect(isShortcutCombination({ key: "c", ctrlKey: true })).toBe(true);
		expect(isShortcutCombination({ key: "c", metaKey: true })).toBe(true);
		expect(isShortcutCombination({ key: "c", altKey: true })).toBe(true);
		expect(isShortcutCombination({ key: "c", shiftKey: true })).toBe(false);
		expect(isShortcutCombination({ key: "Shift" })).toBe(false);
		expect(isShortcutCombination({ ctrlKey: true })).toBe(false);
	});
});

describe("writeKeystrokeTelemetry", () => {
	it("returns 0 and removes an empty telemetry file", async () => {
		setKeystrokeEventsBuffer([]);
		const count = await writeKeystrokeTelemetry(sampleVideoPath);
		expect(count).toBe(0);
		const stat = await fs.stat(getKeystrokeTelemetryPath(sampleVideoPath)).catch(() => null);
		expect(stat).toBeNull();
	});

	it("writes a v1 payload containing the captured keystrokes", async () => {
		setKeystrokeEventsBuffer([
			{ timeMs: 100, key: "Ctrl+C", keycode: 0, hasModifier: true, isShortcut: true },
			{ timeMs: 250, key: "Enter", keycode: 0, hasModifier: false, isShortcut: false },
		]);
		const count = await writeKeystrokeTelemetry(sampleVideoPath);
		expect(count).toBe(2);
		const raw = await fs.readFile(getKeystrokeTelemetryPath(sampleVideoPath), "utf-8");
		const parsed = JSON.parse(raw);
		expect(parsed.version).toBe(KEYSTROKE_TELEMETRY_VERSION);
		expect(parsed.events).toHaveLength(2);
		expect(parsed.events[0].key).toBe("Ctrl+C");
	});

	it("readKeystrokeTelemetry round-trips what writeKeystrokeTelemetry wrote", async () => {
		setKeystrokeEventsBuffer([
			{ timeMs: 50, key: "Ctrl+S", keycode: 0, hasModifier: true, isShortcut: true },
		]);
		await writeKeystrokeTelemetry(sampleVideoPath);
		const data = await readKeystrokeTelemetry(sampleVideoPath);
		expect(data).not.toBeNull();
		expect(data?.events[0].key).toBe("Ctrl+S");
		expect(data?.captureMode).toBe("shortcuts-only");
	});

	it("readKeystrokeTelemetry returns null when the file is missing", async () => {
		const data = await readKeystrokeTelemetry(path.join(fixturesDir, "absent.mp4"));
		expect(data).toBeNull();
	});

	it("readKeystrokeTelemetry rejects malformed JSON", async () => {
		const badPath = path.join(fixturesDir, "bad.mp4");
		await fs.writeFile(badPath, "");
		await fs.writeFile(getKeystrokeTelemetryPath(badPath), "{not-json");
		const data = await readKeystrokeTelemetry(badPath);
		expect(data).toBeNull();
	});
});

describe("getKeystrokeEventsSnapshot", () => {
	it("returns a defensive copy of the buffer", () => {
		setKeystrokeEventsBuffer([
			{ timeMs: 10, key: "Ctrl+A", keycode: 0, hasModifier: true, isShortcut: true },
		]);
		const snap = getKeystrokeEventsSnapshot();
		snap.push({
			timeMs: 999,
			key: "Hijacked",
			keycode: 0,
			hasModifier: false,
			isShortcut: false,
		});
		// Original buffer must not see the hijacked entry.
		expect(getKeystrokeEventsBuffer()).toHaveLength(1);
	});
});

describe("§969 captureMode persistence after stop", () => {
	it("writeKeystrokeTelemetry records the mode that was active, not the post-stop 'off'", async () => {
		const { getKeystrokeCaptureLastMode } = await import("../state");
		// Simulate: start → mode=all → stop (which resets keystrokeCaptureMode to off).
		setKeystrokeCaptureMode("all");
		expect(getKeystrokeCaptureLastMode()).toBe("all");
		setKeystrokeCaptureMode("off"); // what stopKeystrokeCapture() does
		expect(getKeystrokeCaptureLastMode()).toBe("all"); // frozen at start, not reset

		const samplePath = path.join(fixturesDir, "capture-mode.mp4");
		await fs.writeFile(samplePath, "");
		setKeystrokeEventsBuffer([
			{ timeMs: 0, key: "a", keycode: 0, hasModifier: false, isShortcut: false },
		]);
		setKeystrokeCaptureStartedAtMs(Date.now() - 1000);
		const count = await writeKeystrokeTelemetry(samplePath);
		expect(count).toBe(1);

		const raw = JSON.parse(await fs.readFile(getKeystrokeTelemetryPath(samplePath), "utf-8"));
		expect(raw.captureMode).toBe("all");

		// Cleanup
		setKeystrokeEventsBuffer([]);
		await fs.rm(getKeystrokeTelemetryPath(samplePath), { force: true });
	});
});
