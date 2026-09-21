import { describe, expect, it } from "vitest";
import {
	getRunLocationIssue,
	isRunningFromAppTranslocation,
	isRunningFromMountedVolumePath,
	resolveScreenRecordingStatus,
} from "./permissionStatus";

describe("resolveScreenRecordingStatus", () => {
	it("grants when the system API reports granted even if the probe is empty", () => {
		expect(resolveScreenRecordingStatus("granted", "denied")).toBe("granted");
	});

	it("grants when the capture probe succeeds even if the system API lies (macOS 14+/26)", () => {
		expect(resolveScreenRecordingStatus("denied", "granted")).toBe("granted");
	});

	it("grants when both signals agree", () => {
		expect(resolveScreenRecordingStatus("granted", "granted")).toBe("granted");
	});

	it("denies only when neither signal reports granted", () => {
		expect(resolveScreenRecordingStatus("denied", "denied")).toBe("denied");
	});

	it("denies for unknown/undefined signals", () => {
		expect(resolveScreenRecordingStatus(undefined, undefined)).toBe("denied");
		expect(resolveScreenRecordingStatus("unknown", "denied")).toBe("denied");
		expect(resolveScreenRecordingStatus("not-determined", "denied")).toBe("denied");
	});

	it("does not treat arbitrary truthy strings as granted", () => {
		expect(resolveScreenRecordingStatus("restricted", "restricted")).toBe("denied");
	});
});

describe("isRunningFromMountedVolumePath", () => {
	it("detects a bundle launched from a mounted disk image", () => {
		expect(
			isRunningFromMountedVolumePath(
				"/Volumes/Kliq 0.1.0-arm64/Kliq.app/Contents/MacOS/Kliq",
			),
		).toBe(true);
	});

	it("returns false for an installed app", () => {
		expect(isRunningFromMountedVolumePath("/Applications/Kliq.app/Contents/MacOS/Kliq")).toBe(
			false,
		);
	});

	it("returns false for a build output inside the repository", () => {
		expect(
			isRunningFromMountedVolumePath(
				"/Users/me/project/release/mac-arm64/Kliq.app/Contents/MacOS/Kliq",
			),
		).toBe(false);
	});

	it("does not match paths that merely contain the segment", () => {
		expect(isRunningFromMountedVolumePath("/home/Volumes/Kliq.app/bin")).toBe(false);
	});
});

describe("run location issues", () => {
	it("classifies an app running from a mounted disk image", () => {
		expect(getRunLocationIssue("/Volumes/Kliq 0.1.0-arm64/Kliq.app/Contents/MacOS/Kliq")).toBe(
			"mounted-volume",
		);
	});

	it("classifies a Gatekeeper-translocated run", () => {
		expect(
			getRunLocationIssue(
				"/private/var/folders/ab/T/AppTranslocation/1E2F3A4B-Kliq.app/Contents/MacOS/Kliq",
			),
		).toBe("app-translocation");
	});

	it("reports no issue for an installed app", () => {
		expect(getRunLocationIssue("/Applications/Kliq.app/Contents/MacOS/Kliq")).toBeNull();
		expect(getRunLocationIssue("/Users/me/project/release/mac-arm64/Kliq.app/x")).toBeNull();
	});

	it("prefers translocation when both patterns appear", () => {
		expect(
			getRunLocationIssue("/Volumes/x/AppTranslocation/y/Kliq.app/Contents/MacOS/Kliq"),
		).toBe("app-translocation");
	});
});

describe("isRunningFromAppTranslocation", () => {
	it("detects the AppTranslocation marker", () => {
		expect(
			isRunningFromAppTranslocation("/private/var/folders/x/AppTranslocation/y/Kliq"),
		).toBe(true);
		expect(isRunningFromAppTranslocation("/Applications/Kliq.app/Contents/MacOS/Kliq")).toBe(
			false,
		);
	});
});
