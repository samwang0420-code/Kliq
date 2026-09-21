/**
 * Pure helpers behind the macOS screen-recording permission check.
 *
 * Kept separate from the IPC handlers so the decision logic is unit-testable
 * without Electron, and so the reasoning is documented in one place.
 */

export type ScreenRecordingStatus = "granted" | "denied";

/**
 * Resolves the screen-recording permission from the two available signals.
 *
 * Neither signal is trustworthy on its own:
 *
 * - `systemPreferences.getMediaAccessStatus("screen")` is the documented API, but on
 *   macOS 14+ (Sequoia) and 26 (Tahoe) it can keep reporting `denied` while access is
 *   actually granted. This is the false negative that originally made the app alert on
 *   every recording attempt.
 * - `desktopCapturer.getSources({ types: ["screen"] })` performs a real enumeration and
 *   is normally the stronger signal, but it can also yield an empty list or throw for
 *   reasons unrelated to permission: helper process failures, GPU issues, running the
 *   bundle from a read-only disk image, or a stale TCC entry bound to a previous build.
 *
 * Granting when EITHER signal says granted avoids the blocking false-negative alert.
 * When access is genuinely missing, the recording itself fails and surfaces a concrete
 * error, which is a better failure mode than a possibly-wrong pre-flight alert.
 */
export function resolveScreenRecordingStatus(
	systemStatus: string | undefined,
	actualStatus: string | undefined,
): ScreenRecordingStatus {
	return systemStatus === "granted" || actualStatus === "granted" ? "granted" : "denied";
}

/**
 * True when the running bundle lives on a mounted disk image (`/Volumes/...`).
 *
 * macOS ties Screen Recording / Accessibility grants to the signed identity of a
 * specific copy. A DMG copy is usually an older build with a different signature, so
 * granting permission to it has no effect on the installed app (and vice versa).
 * Detecting this lets the app tell the user the actually actionable fix.
 */
export function isRunningFromMountedVolumePath(execPath: string): boolean {
	return execPath.startsWith("/Volumes/");
}

/**
 * True when macOS is running a Gatekeeper-translocated copy of the app.
 *
 * A quarantined bundle launched outside `/Applications` (for example straight from
 * a downloaded DMG or `~/Downloads`) is executed from a random read-only path under
 * `/private/var/folders/.../AppTranslocation/...`. Every launch can get a different
 * path, TCC grants never bind to the real bundle, and permission prompts repeat
 * forever. The fix is to copy the app to `/Applications` and remove the quarantine
 * attribute.
 */
export function isRunningFromAppTranslocation(execPath: string): boolean {
	return execPath.includes("/AppTranslocation/");
}

/** Machine-readable reason why the current run location breaks permission grants. */
export type RunLocationIssue = "mounted-volume" | "app-translocation" | null;

export function getRunLocationIssue(execPath: string): RunLocationIssue {
	if (isRunningFromAppTranslocation(execPath)) {
		return "app-translocation";
	}
	if (isRunningFromMountedVolumePath(execPath)) {
		return "mounted-volume";
	}
	return null;
}
