import { useEffect, useMemo, useRef, useState } from "react";
import {
	filterVisibleKeystrokes,
	type KeystrokeOverlayEvent as KeystrokeOverlayEventBase,
} from "./KeystrokeOverlay.helpers";

export type KeystrokeOverlayEvent = KeystrokeOverlayEventBase;

interface KeystrokeTelemetryFile {
	version: number;
	captureMode: "off" | "shortcuts-only" | "all";
	startedAt: string;
	endedAt: string;
	events: KeystrokeOverlayEvent[];
}

export interface KeystrokeOverlayProps {
	videoPath: string | null;
	/** Current playback time in milliseconds. */
	currentTimeMs: number;
	/** How long a single keystroke stays visible on the overlay (ms). */
	displayDurationMs?: number;
	/** Max number of keystroke pills shown at once. */
	maxPills?: number;
}

const DEFAULT_DISPLAY_MS = 1800;
const DEFAULT_MAX_PILLS = 5;

function isElectronAvailable(): boolean {
	return (
		typeof window !== "undefined" &&
		typeof (window as unknown as { electronAPI?: unknown }).electronAPI !== "undefined"
	);
}

export function KeystrokeOverlay({
	videoPath,
	currentTimeMs,
	displayDurationMs = DEFAULT_DISPLAY_MS,
	maxPills = DEFAULT_MAX_PILLS,
}: KeystrokeOverlayProps) {
	const [events, setEvents] = useState<KeystrokeOverlayEvent[]>([]);
	const [loadError, setLoadError] = useState<string | null>(null);
	const lastLoadedPathRef = useRef<string | null>(null);

	useEffect(() => {
		if (!videoPath) {
			setEvents([]);
			setLoadError(null);
			lastLoadedPathRef.current = null;
			return;
		}
		if (!isElectronAvailable()) {
			setEvents([]);
			return;
		}
		if (lastLoadedPathRef.current === videoPath) {
			return;
		}
		lastLoadedPathRef.current = videoPath;
		setLoadError(null);
		const api = window.electronAPI as {
			readKeystrokeTelemetry?: (path: string) => Promise<{
				success: boolean;
				data?: KeystrokeTelemetryFile | null;
				error?: string;
			}>;
		};
		if (typeof api.readKeystrokeTelemetry !== "function") {
			setLoadError("Renderer is missing readKeystrokeTelemetry IPC bridge");
			return;
		}
		let cancelled = false;
		api.readKeystrokeTelemetry(videoPath)
			.then((result) => {
				if (cancelled) return;
				if (!result.success || !result.data) {
					setEvents([]);
					return;
				}
				setEvents(result.data.events);
			})
			.catch((err) => {
				if (cancelled) return;
				setLoadError(String(err));
			});
		return () => {
			cancelled = true;
		};
	}, [videoPath]);

	const visible = useMemo(
		() => filterVisibleKeystrokes(events, currentTimeMs, displayDurationMs, maxPills),
		[events, currentTimeMs, displayDurationMs, maxPills],
	);

	if (!visible.length) {
		return null;
	}

	return (
		<div
			className="pointer-events-none absolute inset-x-0 bottom-12 flex flex-col items-center gap-1.5 px-4"
			data-testid="keystroke-overlay"
			aria-hidden="true"
		>
			<div className="flex flex-wrap items-center justify-center gap-1.5">
				{visible.map((evt) => (
					<span
						key={`${evt.timeMs}-${evt.key}`}
						className="rounded-md border border-foreground/15 bg-foreground/85 px-2.5 py-1 text-xs font-mono font-medium text-background shadow-md backdrop-blur-sm"
						style={{
							opacity: Math.max(
								0.35,
								1 - (currentTimeMs - evt.timeMs) / displayDurationMs,
							),
						}}
					>
						{evt.key}
					</span>
				))}
			</div>
			{loadError ? (
				<span className="rounded bg-red-500/80 px-2 py-0.5 text-[10px] text-white">
					keystroke overlay: {loadError}
				</span>
			) : null}
		</div>
	);
}

export default KeystrokeOverlay;
