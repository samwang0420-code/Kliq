import fs from "node:fs/promises";
import path from "node:path";
import { app, desktopCapturer, ipcMain, shell, systemPreferences } from "electron";
import { getRunLocationIssue, resolveScreenRecordingStatus } from "../../permissionStatus";
import { getMacPrivacySettingsUrl } from "../utils";

/**
 * Appends one JSON line per permission probe to
 * `<userData>/permission-diagnostics.log`.
 *
 * Why this exists: the OS unified log is unreadable for troubleshooting in many
 * environments (sandbox, missing Full Disk Access) and macOS 26 gives no UI that
 * explains *why* a granted toggle has no effect. Writing our own ground truth to
 * the app's userData directory makes the next occurrence diagnosable from the
 * filesystem alone.
 */
async function appendPermissionDiagnostic(entry: Record<string, unknown>): Promise<void> {
	try {
		const logFile = path.join(app.getPath("userData"), "permission-diagnostics.log");
		await fs.appendFile(logFile, `${new Date().toISOString()} ${JSON.stringify(entry)}\n`);
	} catch {
		// Diagnostics must never break the permission flow.
	}
}

export function registerPermissionHandlers() {
	ipcMain.handle("open-external-url", async (_, url: string) => {
		try {
			// Security: only allow http/https URLs to prevent file:// or custom protocol abuse
			const parsed = new URL(url);
			if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
				return { success: false, error: `Blocked non-HTTP URL: ${parsed.protocol}` };
			}
			await shell.openExternal(url);
			return { success: true };
		} catch (error) {
			console.error("Failed to open URL:", error);
			return { success: false, error: String(error) };
		}
	});

	ipcMain.handle("get-accessibility-permission-status", async () => {
		if (process.platform !== "darwin") {
			return { success: true, trusted: true, prompted: false };
		}

		const trusted = systemPreferences.isTrustedAccessibilityClient(false);
		await appendPermissionDiagnostic({
			event: "accessibility-permission-check",
			trusted,
			prompt: false,
			runLocation: getRunLocationIssue(process.execPath),
			execPath: process.execPath,
			version: app.getVersion(),
		});

		return {
			success: true,
			trusted,
			prompted: false,
		};
	});

	ipcMain.handle("request-accessibility-permission", async () => {
		if (process.platform !== "darwin") {
			return { success: true, trusted: true, prompted: false };
		}

		const trusted = systemPreferences.isTrustedAccessibilityClient(true);
		await appendPermissionDiagnostic({
			event: "accessibility-permission-request",
			trusted,
			prompt: true,
			runLocation: getRunLocationIssue(process.execPath),
			execPath: process.execPath,
			version: app.getVersion(),
		});

		return {
			success: true,
			trusted,
			prompted: true,
		};
	});

	ipcMain.handle("get-screen-recording-permission-status", async () => {
		if (process.platform !== "darwin") {
			return { success: true, status: "granted" };
		}

		// Two independent signals, because neither is trustworthy alone on modern macOS:
		//  1. systemPreferences.getMediaAccessStatus("screen") — the documented API, but on
		//     macOS 14+ (Sequoia) / 26 (Tahoe) it can report denied while access is granted.
		//  2. desktopCapturer.getSources — an actual enumeration attempt; normally the
		//     stronger signal, but it can return an empty list for unrelated reasons
		//     (helper/GPU errors, running from a read-only volume).
		// Treat access as granted when EITHER says so. A genuine denial then surfaces as a
		// capture error during recording instead of blocking the user up front with an
		// alert that may be wrong.
		let systemStatus: string = "unknown";
		try {
			systemStatus = systemPreferences.getMediaAccessStatus("screen");
		} catch (error) {
			console.error("Failed to get screen recording status via system API:", error);
		}

		let actualStatus: "granted" | "denied" = "denied";
		let probeError: string | undefined;
		let probedSourceCount = 0;
		try {
			const sources = await desktopCapturer.getSources({ types: ["screen"] });
			probedSourceCount = sources.length;
			actualStatus = sources.length > 0 ? "granted" : "denied";
		} catch (error) {
			probeError = String(error);
			console.warn(
				"desktopCapturer.getSources failed (screen recording permission may be missing):",
				error,
			);
			actualStatus = "denied";
		}

		const runLocation = getRunLocationIssue(process.execPath);
		const status = resolveScreenRecordingStatus(systemStatus, actualStatus);

		await appendPermissionDiagnostic({
			event: "screen-permission-check",
			status,
			systemStatus,
			actualStatus,
			probedSourceCount,
			probeError,
			runLocation,
			execPath: process.execPath,
			version: app.getVersion(),
			electron: process.versions.electron,
		});

		return {
			success: true,
			status,
			systemStatus,
			actualStatus,
			runLocation,
		};
	});

	ipcMain.handle("open-screen-recording-preferences", async () => {
		if (process.platform !== "darwin") {
			return { success: true };
		}

		try {
			await shell.openExternal(getMacPrivacySettingsUrl("screen"));
			return { success: true };
		} catch (error) {
			console.error("Failed to open Screen Recording preferences:", error);
			return { success: false, error: String(error) };
		}
	});

	ipcMain.handle("open-accessibility-preferences", async () => {
		if (process.platform !== "darwin") {
			return { success: true };
		}

		try {
			await shell.openExternal(getMacPrivacySettingsUrl("accessibility"));
			return { success: true };
		} catch (error) {
			console.error("Failed to open Accessibility preferences:", error);
			return { success: false, error: String(error) };
		}
	});
}
