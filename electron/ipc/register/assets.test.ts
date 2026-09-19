import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
	app: {
		getAppPath: () => process.cwd(),
		getPath: () => process.env.TEMP ?? process.cwd(),
		isPackaged: false,
	},
	ipcMain: {
		handle: vi.fn(),
	},
}));

vi.mock("../media/mediaPaths", () => ({
	resolveMediaRootFromAppPaths: () => process.env.TEMP ?? process.cwd(),
}));

const ipcHandlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
const ipcMainMock = (await import("electron")).ipcMain as unknown as {
	handle: (channel: string, listener: (...args: unknown[]) => Promise<unknown>) => void;
};

beforeEach(() => {
	ipcHandlers.clear();
	vi.mocked(ipcMainMock.handle).mockImplementation((channel, listener) => {
		ipcHandlers.set(channel, listener);
	});
});

const { registerAssetHandlers } = await import("./assets");

const tempDirs: string[] = [];

afterEach(async () => {
	vi.restoreAllMocks();
	await Promise.allSettled(
		tempDirs.splice(0).map((dir) => fs.rm(dir, { force: true, recursive: true })),
	);
});

describe("registerAssetHandlers.read-local-file", () => {
	it("registers the read-local-file channel", () => {
		registerAssetHandlers();
		expect(ipcHandlers.has("read-local-file")).toBe(true);
	});

	it("reads a small file (<2 GiB) correctly via fileHandle.read", async () => {
		registerAssetHandlers();
		const handler = ipcHandlers.get("read-local-file");
		expect(handler).toBeTypeOf("function");

		const payload = Buffer.from("hello yanjing-recorder", "utf8");
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "yanjing-assets-small-"));
		tempDirs.push(dir);
		const filePath = path.join(dir, "small.bin");
		await fs.writeFile(filePath, payload);

		const result = (await handler!({}, filePath)) as {
			success: boolean;
			data?: Buffer;
			error?: string;
		};

		expect(result.success).toBe(true);
		expect(result.data).toBeInstanceOf(Buffer);
		expect(Buffer.compare(result.data!, payload)).toBe(0);
	});

	it("reads a >2 GiB file without ERR_FS_FILE_TOO_LARGE (regression for #520 / #493 / #328 / #375)", async () => {
		registerAssetHandlers();
		const handler = ipcHandlers.get("read-local-file");
		expect(handler).toBeTypeOf("function");

		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "yanjing-assets-large-"));
		tempDirs.push(dir);
		const filePath = path.join(dir, "large-fixture.bin");
		const header = Buffer.from("YANJING-LARGE-HEADER-PAYLOAD", "utf8");
		await fs.writeFile(filePath, header);
		const fileHandle = await fs.open(filePath, "r+");
		try {
			const targetSize = (2.5 * 1024 + 512) * 1024 * 1024;
			await fileHandle.truncate(targetSize);
		} finally {
			await fileHandle.close();
		}

		const result = (await handler!({}, filePath)) as {
			success: boolean;
			data?: Buffer;
			error?: string;
		};

		expect(result.success).toBe(true);
		expect(result.data).toBeInstanceOf(Buffer);
		expect(result.data!.length).toBe((2.5 * 1024 + 512) * 1024 * 1024);
		expect(result.data!.subarray(0, header.length).compare(header)).toBe(0);
	}, 60_000);

	it("returns success:false when the file does not exist", async () => {
		registerAssetHandlers();
		const handler = ipcHandlers.get("read-local-file");
		expect(handler).toBeTypeOf("function");

		const result = (await handler!({}, "/nonexistent/yanjing-recorder-fixture.bin")) as {
			success: boolean;
			error?: string;
		};

		expect(result.success).toBe(false);
		expect(result.error).toBeTypeOf("string");
		expect(result.error!.length).toBeGreaterThan(0);
	});
});
