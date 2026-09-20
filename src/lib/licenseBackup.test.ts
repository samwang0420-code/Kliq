import { describe, expect, it } from "vitest";

import {
	buildLicenseBackup,
	LICENSE_BACKUP_FORMAT,
	LICENSE_BACKUP_VERSION,
	parseLicenseBackup,
	serializeLicenseBackup,
	suggestLicenseBackupFileName,
} from "./licenseBackup";

const KEY = "kliq-pro-1a2b3c4d";
const FIXED_NOW = new Date("2026-09-20T12:00:00Z").getTime();

function validFile(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		format: LICENSE_BACKUP_FORMAT,
		version: LICENSE_BACKUP_VERSION,
		licenseKey: KEY,
		exportedAt: FIXED_NOW,
		...overrides,
	});
}

describe("buildLicenseBackup", () => {
	it("records the format, version and export time", () => {
		expect(buildLicenseBackup({ licenseKey: KEY, now: FIXED_NOW })).toEqual({
			format: LICENSE_BACKUP_FORMAT,
			version: LICENSE_BACKUP_VERSION,
			licenseKey: KEY,
			exportedAt: FIXED_NOW,
		});
	});

	it("trims the key instead of storing user whitespace", () => {
		expect(buildLicenseBackup({ licenseKey: `  ${KEY}\n`, now: FIXED_NOW }).licenseKey).toBe(
			KEY,
		);
	});

	it("carries optional activation metadata when provided", () => {
		const backup = buildLicenseBackup({
			licenseKey: KEY,
			activatedAt: 1_700_000_000_000,
			offline: true,
			now: FIXED_NOW,
		});
		expect(backup.activatedAt).toBe(1_700_000_000_000);
		expect(backup.offline).toBe(true);
	});

	it("omits optional fields entirely when absent rather than writing undefined", () => {
		const backup = buildLicenseBackup({ licenseKey: KEY, now: FIXED_NOW });
		expect(Object.keys(backup).sort()).toEqual(
			["exportedAt", "format", "licenseKey", "version"].sort(),
		);
	});
});

describe("serialize + parse round trip", () => {
	it("survives a full write/read cycle", () => {
		const original = buildLicenseBackup({
			licenseKey: KEY,
			activatedAt: 1_700_000_000_000,
			now: FIXED_NOW,
		});
		const parsed = parseLicenseBackup(serializeLicenseBackup(original));

		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.backup).toEqual(original);
	});

	it("writes human-readable indented JSON ending with a newline", () => {
		const text = serializeLicenseBackup(
			buildLicenseBackup({ licenseKey: KEY, now: FIXED_NOW }),
		);
		expect(text.endsWith("\n")).toBe(true);
		expect(text).toContain("\n  ");
		expect(text).toContain(KEY);
	});
});

describe("parseLicenseBackup rejections", () => {
	function expectReason(raw: string, reason: string) {
		const parsed = parseLicenseBackup(raw);
		expect(parsed.ok).toBe(false);
		if (parsed.ok) return;
		expect(parsed.reason).toBe(reason);
	}

	it("rejects text that is not JSON", () => {
		expectReason("这不是 JSON", "notJson");
		expectReason("", "notJson");
	});

	it("rejects JSON that is not an object", () => {
		expectReason("[]", "notObject");
		expectReason("null", "notObject");
		expectReason('"kliq-pro-1a2b3c4d"', "notObject");
		expectReason("42", "notObject");
	});

	it("rejects a file from another product", () => {
		expectReason(validFile({ format: "some-other-app-backup" }), "wrongFormat");
		expectReason(JSON.stringify({ licenseKey: KEY }), "wrongFormat");
	});

	it("rejects a future or unknown version rather than guessing", () => {
		expectReason(validFile({ version: LICENSE_BACKUP_VERSION + 1 }), "unsupportedVersion");
		expectReason(validFile({ version: 0 }), "unsupportedVersion");
		expectReason(validFile({ version: "1" }), "unsupportedVersion");
	});

	it("rejects a file whose key does not pass format validation", () => {
		expectReason(validFile({ licenseKey: "" }), "invalidKey");
		expectReason(validFile({ licenseKey: "not-a-key" }), "invalidKey");
		expectReason(validFile({ licenseKey: "kliq-pro-1234" }), "invalidKey");
		expectReason(validFile({ licenseKey: 12345 }), "invalidKey");
		expectReason(validFile({ licenseKey: undefined }), "invalidKey");
	});
});

describe("parseLicenseBackup tolerance", () => {
	it("accepts the legacy key prefix so pre-rename customers can still restore", () => {
		const parsed = parseLicenseBackup(validFile({ licenseKey: "yanjing-pro-1a2b3c4d" }));
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.backup.licenseKey).toBe("yanjing-pro-1a2b3c4d");
	});

	it("ignores unknown extra fields instead of failing the whole restore", () => {
		const parsed = parseLicenseBackup(validFile({ note: "存到网盘了", tags: [1, 2, 3] }));
		expect(parsed.ok).toBe(true);
	});

	it("normalizes a missing or bogus exportedAt to 0 rather than NaN", () => {
		for (const exportedAt of [undefined, "yesterday", Number.NaN]) {
			const parsed = parseLicenseBackup(validFile({ exportedAt }));
			expect(parsed.ok).toBe(true);
			if (!parsed.ok) return;
			expect(parsed.backup.exportedAt).toBe(0);
		}
	});

	it("trims whitespace around the key on restore", () => {
		const parsed = parseLicenseBackup(validFile({ licenseKey: ` ${KEY} ` }));
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.backup.licenseKey).toBe(KEY);
	});
});

describe("suggestLicenseBackupFileName", () => {
	it("embeds a zero-padded local date", () => {
		const name = suggestLicenseBackupFileName(new Date(2026, 0, 5).getTime());
		expect(name).toBe("kliq-license-2026-01-05.json");
	});
});
