import { createRequire } from "node:module";
import {
	getKeystrokeCaptureElapsedMs,
	getKeystrokeCaptureLastMode,
	getKeystrokeEventsBuffer,
	isCursorCaptureActive,
	keystrokeCaptureAccumulatedPausedMs,
	keystrokeCaptureActive,
	keystrokeCaptureMode,
	keystrokeCapturePauseStartedAtMs,
	keystrokeEventsBuffer,
	setKeystrokeCaptureAccumulatedPausedMs,
	setKeystrokeCaptureActive,
	setKeystrokeCaptureMode,
	setKeystrokeCapturePauseStartedAtMs,
	setKeystrokeCaptureStartedAtMs,
	setKeystrokeEventsBuffer,
} from "../state";
import type {
	HookKeyboardEvent,
	HookKeyboardListener,
	KeystrokeEvent,
	UiohookLike,
	UiohookModuleNamespace,
} from "../types";
import { isCursorCapturePaused } from "./telemetry";

const nodeRequire = createRequire(import.meta.url);

/**
 * Normalise a uiohook keyboard event into a stable "Cmd+Shift+P"-style label.
 *
 * Modifiers are emitted in a fixed order (Ctrl, Meta, Alt, Shift) so identical
 * combos hash the same regardless of the OS or the order the driver delivered
 * the events. Bare key presses drop the modifier prefix.
 */
export function normalizeKeystrokeLabel(event: HookKeyboardEvent): string {
	const data = event.data ?? {};
	const ctrl = Boolean(event.ctrlKey ?? data.ctrlKey);
	const meta = Boolean(event.metaKey ?? data.metaKey);
	const alt = Boolean(event.altKey ?? data.altKey);
	const shift = Boolean(event.shiftKey ?? data.shiftKey);
	const rawKeyRaw = event.key ?? data.key ?? "";
	const rawKey = rawKeyRaw; // preserve space — `trim()` would erase it

	const parts: string[] = [];
	if (ctrl) parts.push("Ctrl");
	if (meta) parts.push(process.platform === "darwin" ? "Cmd" : "Meta");
	if (alt) parts.push("Alt");
	if (shift) parts.push("Shift");

	if (rawKey) {
		parts.push(formatKeyToken(rawKey, shift));
	} else {
		const code = event.keycode ?? data.keycode;
		if (typeof code === "number" && code > 0) {
			parts.push(`Key${code}`);
		}
	}

	return parts.join("+");
}

function formatKeyToken(rawKey: string, shift: boolean): string {
	if (rawKey === " ") return "Space";
	if (rawKey.length === 1) {
		// Shift only affects letter case; other punctuation stays the same.
		if (/^[a-z]$/i.test(rawKey)) {
			return shift ? rawKey.toUpperCase() : rawKey.toUpperCase();
		}
		return rawKey;
	}
	// Already a friendly name like "Enter", "ArrowUp", "Backspace".
	return rawKey;
}

export function hasModifier(event: HookKeyboardEvent): boolean {
	const data = event.data ?? {};
	return Boolean(
		event.ctrlKey ??
			data.ctrlKey ??
			event.metaKey ??
			data.metaKey ??
			event.altKey ??
			data.altKey ??
			event.shiftKey ??
			data.shiftKey,
	);
}

export function isShortcutCombination(event: HookKeyboardEvent): boolean {
	const data = event.data ?? {};
	const ctrl = Boolean(event.ctrlKey ?? data.ctrlKey);
	const meta = Boolean(event.metaKey ?? data.metaKey);
	const alt = Boolean(event.altKey ?? data.altKey);
	const rawKeyRaw = event.key ?? data.key ?? "";
	const rawKey = rawKeyRaw; // preserve space — `trim()` would erase it
	// A shortcut must include at least one of Ctrl/Meta/Alt AND a non-modifier key.
	if (!(ctrl || meta || alt)) return false;
	if (rawKey === "Control" || rawKey === "Meta" || rawKey === "Alt" || rawKey === "Shift") {
		return false;
	}
	return Boolean(rawKey) || typeof (event.keycode ?? data.keycode) === "number";
}

function shouldKeepKeystroke(event: HookKeyboardEvent): boolean {
	if (keystrokeCaptureMode === "off") return false;
	if (keystrokeCaptureMode === "shortcuts-only") {
		return isShortcutCombination(event);
	}
	// "all" mode: skip the lone modifier presses themselves, but capture every key.
	const rawKey = event.key ?? event.data?.key ?? "";
	if (rawKey === "Control" || rawKey === "Meta" || rawKey === "Alt" || rawKey === "Shift") {
		return false;
	}
	return true;
}

function resolveUiohookModule(
	moduleExports: UiohookModuleNamespace | UiohookLike,
): UiohookLike | null {
	const candidate = moduleExports as Partial<UiohookLike> | null;
	if (candidate && typeof candidate === "object" && typeof candidate.on === "function") {
		return candidate as UiohookLike;
	}
	if (candidate && typeof candidate === "object") {
		const inner = candidate as UiohookModuleNamespace;
		if (inner.uIOhook) return inner.uIOhook;
		if (inner.uiohook) return inner.uiohook;
		if (inner.Uiohook) return inner.Uiohook;
		if (inner.default) return resolveUiohookModule(inner.default);
	}
	return null;
}

function loadUiohookModule(): UiohookLike | null {
	try {
		const moduleExports = nodeRequire("uiohook-napi") as UiohookModuleNamespace;
		return resolveUiohookModule(moduleExports);
	} catch (error) {
		console.warn("[KeystrokeTelemetry] Failed to load uiohook-napi:", error);
		return null;
	}
}

export function clearKeystrokeEvents() {
	setKeystrokeEventsBuffer([]);
}

export function getKeystrokeEventsSnapshot() {
	// Return a defensive copy so renderer-side consumers can mutate without
	// affecting the live buffer.
	return getKeystrokeEventsBuffer().map((evt) => ({ ...evt }));
}

export function startKeystrokeCapture(mode: "off" | "shortcuts-only" | "all") {
	if (mode === "off") {
		stopKeystrokeCapture();
		return;
	}
	if (!isCursorCaptureActive) {
		// Keystroke capture piggy-backs on the same global hook lifecycle as the
		// cursor monitor so we never double-start uiohook.
		return;
	}

	if (!["darwin", "win32", "linux"].includes(process.platform)) {
		return;
	}

	stopKeystrokeCapture();
	setKeystrokeCaptureMode(mode);
	setKeystrokeCaptureActive(true);
	clearKeystrokeEvents();
	setKeystrokeCaptureStartedAtMs(Date.now());
	setKeystrokeCaptureAccumulatedPausedMs(0);
	setKeystrokeCapturePauseStartedAtMs(null);

	// Reuse the same loadUiohookModule as the mouse interaction handler by
	// reusing the existing hook reference if it has already been started.
	// The interaction.ts handler will pick up our listener registration through
	// the existing hook instance.
	const hook = loadUiohookModule();
	if (!hook || typeof hook.on !== "function") {
		console.warn("[KeystrokeTelemetry] uiohook unavailable — keystroke capture disabled");
		setKeystrokeCaptureActive(false);
		setKeystrokeCaptureMode("off");
		return;
	}

	const onKeydown: HookKeyboardListener = (event) => {
		if (!keystrokeCaptureActive) return;
		if (isCursorCapturePaused()) return;
		if (!shouldKeepKeystroke(event)) return;

		const timeMs = getKeystrokeCaptureElapsedMs();
		const label = normalizeKeystrokeLabel(event);
		if (!label) return;
		const data = event.data ?? {};
		const keycode =
			typeof event.keycode === "number"
				? event.keycode
				: typeof data.keycode === "number"
					? data.keycode
					: 0;

		const evt = {
			timeMs,
			key: label,
			keycode,
			hasModifier: hasModifier(event),
			isShortcut: isShortcutCombination(event),
		};
		keystrokeEventsBuffer.push(evt);
		// Cap the buffer at 20k events to avoid unbounded growth during long
		// recordings. Most users typing at <120 wpm produce <10k/min.
		if (keystrokeEventsBuffer.length > 20_000) {
			keystrokeEventsBuffer.shift();
		}
	};

	hook.on("keydown", onKeydown);

	// Roll our own cleanup hook (parallel to the mouse one). Both run in order.
	const previousCleanup = (globalThis as { __keystrokeCleanup__?: () => void })
		.__keystrokeCleanup__;
	const ourCleanup = () => {
		try {
			if (typeof hook.off === "function") {
				hook.off("keydown", onKeydown);
			} else if (typeof hook.removeListener === "function") {
				hook.removeListener("keydown", onKeydown);
			}
		} catch {
			// ignore listener cleanup errors
		}
		(globalThis as { __keystrokeCleanup__?: () => void }).__keystrokeCleanup__ =
			previousCleanup;
	};
	(globalThis as { __keystrokeCleanup__?: () => void }).__keystrokeCleanup__ = ourCleanup;

	// Chain onto the existing interactionCaptureCleanup so a single recording
	// stop cleans up both mouse and keyboard listeners.
	const previousInteractionCleanup = (
		globalThis as {
			__interactionCleanupNext__?: () => void;
		}
	).__interactionCleanupNext__;
	(globalThis as { __interactionCleanupNext__?: () => void }).__interactionCleanupNext__ =
		ourCleanup;
	void previousInteractionCleanup;
}

export function stopKeystrokeCapture() {
	const cleanup = (globalThis as { __keystrokeCleanup__?: () => void }).__keystrokeCleanup__;
	if (cleanup) {
		try {
			cleanup();
		} catch {
			// ignore cleanup errors
		}
		(globalThis as { __keystrokeCleanup__?: () => void }).__keystrokeCleanup__ = undefined;
	}
	setKeystrokeCaptureActive(false);
	setKeystrokeCaptureMode("off");
}

export function pauseKeystrokeCapture() {
	if (!keystrokeCaptureActive) return;
	if (keystrokeCapturePauseStartedAtMs !== null) return;
	setKeystrokeCapturePauseStartedAtMs(Date.now());
}

export function resumeKeystrokeCapture() {
	if (!keystrokeCaptureActive) return;
	if (keystrokeCapturePauseStartedAtMs === null) return;
	const paused = Date.now() - keystrokeCapturePauseStartedAtMs;
	setKeystrokeCaptureAccumulatedPausedMs(keystrokeCaptureAccumulatedPausedMs + paused);
	setKeystrokeCapturePauseStartedAtMs(null);
}

export function isKeystrokeCaptureActive(): boolean {
	return keystrokeCaptureActive;
}

// ── Persistence helpers ───────────────────────────────────────────────────────
import fs from "node:fs/promises";

export const KEYSTROKE_TELEMETRY_VERSION = 1;

export function getKeystrokeTelemetryPath(videoPath: string): string {
	return `${videoPath}.keystrokes.json`;
}

export interface KeystrokeTelemetryFile {
	version: number;
	captureMode: "off" | "shortcuts-only" | "all";
	startedAt: string;
	endedAt: string;
	events: KeystrokeEvent[];
}

export async function writeKeystrokeTelemetry(videoPath: string) {
	const path = getKeystrokeTelemetryPath(videoPath);
	const events = getKeystrokeEventsSnapshot();
	if (events.length === 0) {
		await fs.rm(path, { force: true });
		return events.length;
	}
	const payload: KeystrokeTelemetryFile = {
		version: KEYSTROKE_TELEMETRY_VERSION,
		// §969: read the mode captured at start time (not the current state, which
		// stopKeystrokeCapture() has already reset to "off").
		captureMode: getKeystrokeCaptureLastMode(),
		startedAt: new Date(Date.now() - getKeystrokeCaptureElapsedMs()).toISOString(),
		endedAt: new Date().toISOString(),
		events,
	};
	await fs.writeFile(path, JSON.stringify(payload, null, 2), "utf-8");
	return events.length;
}

export async function readKeystrokeTelemetry(
	videoPath: string,
): Promise<KeystrokeTelemetryFile | null> {
	try {
		const raw = await fs.readFile(getKeystrokeTelemetryPath(videoPath), "utf-8");
		const parsed = JSON.parse(raw);
		if (
			parsed &&
			typeof parsed === "object" &&
			parsed.version === KEYSTROKE_TELEMETRY_VERSION &&
			Array.isArray(parsed.events)
		) {
			return parsed as KeystrokeTelemetryFile;
		}
	} catch {
		// No keystroke telemetry for this recording — expected.
	}
	return null;
}
