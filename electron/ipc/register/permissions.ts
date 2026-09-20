import { desktopCapturer, ipcMain, shell, systemPreferences } from "electron";
import { getMacPrivacySettingsUrl } from "../utils";

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

	ipcMain.handle("get-accessibility-permission-status", () => {
		if (process.platform !== "darwin") {
			return { success: true, trusted: true, prompted: false };
		}

		return {
			success: true,
			trusted: systemPreferences.isTrustedAccessibilityClient(false),
			prompted: false,
		};
	});

	ipcMain.handle("request-accessibility-permission", () => {
		if (process.platform !== "darwin") {
			return { success: true, trusted: true, prompted: false };
		}

		return {
			success: true,
			trusted: systemPreferences.isTrustedAccessibilityClient(true),
			prompted: true,
		};
	});

	ipcMain.handle("get-screen-recording-permission-status", async () => {
		if (process.platform !== "darwin") {
			return { success: true, status: "granted" };
		}

		// macOS 14+ (Sequoia) / 26 (Tahoe): systemPreferences.getMediaAccessStatus("screen")
		// is unreliable — it can return "denied"/"not-determined" even when the user has
		// granted access. Probe desktopCapturer.getSources instead: if we can enumerate
		// screens, permission is effectively granted. Ported from the 2026-09-19 fix.
		let systemStatus = "unknown";
		try {
			systemStatus = systemPreferences.getMediaAccessStatus("screen");
		} catch (error) {
			console.error("Failed to get screen recording status via system API:", error);
		}

		let actualStatus: "granted" | "denied" = "denied";
		try {
			const sources = await desktopCapturer.getSources({ types: ["screen"] });
			actualStatus = sources.length > 0 ? "granted" : "denied";
		} catch (error) {
			console.warn(
				"desktopCapturer.getSources failed (screen recording permission may be missing):",
				error,
			);
			actualStatus = "denied";
		}

		// Trust the actual probe over the (broken on macOS 14+) system API.
		return {
			success: true,
			status: actualStatus === "granted" ? "granted" : "denied",
			systemStatus,
			actualStatus,
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
