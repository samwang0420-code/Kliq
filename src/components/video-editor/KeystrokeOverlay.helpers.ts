export interface KeystrokeOverlayEvent {
	timeMs: number;
	key: string;
	keycode: number;
	hasModifier: boolean;
	isShortcut: boolean;
}

export function filterVisibleKeystrokes(
	events: KeystrokeOverlayEvent[],
	currentTimeMs: number,
	displayDurationMs: number,
	maxPills = 5,
): KeystrokeOverlayEvent[] {
	if (events.length === 0 || currentTimeMs <= 0) return [];
	const cutoff = currentTimeMs - displayDurationMs;
	// Left-open window so displayDuration==0 hides all keystrokes (no chip clutter on seek).
	const filtered = events.filter((evt) => evt.timeMs <= currentTimeMs && evt.timeMs > cutoff);
	if (filtered.length <= maxPills) return filtered;
	return filtered.slice(-maxPills);
}
