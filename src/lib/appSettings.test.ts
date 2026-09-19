import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAppSetting, saveAppSetting } from "./appSettings";

type Store = Record<string, unknown>;

function installApi(store: Store) {
	const getAppSetting = vi.fn((key: string) => store[key]);
	const setAppSetting = vi.fn((key: string, value: unknown) => {
		store[key] = value;
		return true;
	});
	(globalThis as { electronAPI?: unknown }).electronAPI = {
		getAppSetting,
		setAppSetting,
	};
	return { getAppSetting, setAppSetting };
}

function uninstallApi() {
	delete (globalThis as { electronAPI?: unknown }).electronAPI;
}

describe("appSettings brand-key migration", () => {
	beforeEach(() => {
		uninstallApi();
	});
	afterEach(() => {
		uninstallApi();
	});

	it("returns yanjing.locale when set", () => {
		const store: Store = { "yanjing.locale": "zh-CN" };
		installApi(store);
		expect(loadAppSetting<string>("yanjing.locale")).toBe("zh-CN");
	});

	it("falls back to legacy recordly.locale and copies the value forward", () => {
		const store: Store = { "recordly.locale": "zh-CN" };
		const { setAppSetting } = installApi(store);
		expect(loadAppSetting<string>("yanjing.locale")).toBe("zh-CN");
		// And the value should now be persisted under the new key.
		expect(setAppSetting).toHaveBeenCalledWith("yanjing.locale", "zh-CN");
		expect(store["yanjing.locale"]).toBe("zh-CN");
	});

	it("prefers yanjing.theme over legacy recordly.theme", () => {
		const store: Store = {
			"recordly.theme": "light",
			"yanjing.theme": "dark",
		};
		installApi(store);
		expect(loadAppSetting<string>("yanjing.theme")).toBe("dark");
	});

	it("returns null for unknown keys without legacy fallback", () => {
		const store: Store = {};
		installApi(store);
		expect(loadAppSetting<string>("yanjing.unknown")).toBeNull();
	});

	it("saveAppSetting writes to the new key only", () => {
		const store: Store = {};
		installApi(store);
		saveAppSetting("yanjing.theme", "dark");
		expect(store["yanjing.theme"]).toBe("dark");
		expect(store["recordly.theme"]).toBeUndefined();
	});

	it("fallback swallows setAppSetting errors (next load still works)", () => {
		const store: Store = { "recordly.editor.preferences": { foo: 1 } };
		const { setAppSetting } = installApi(store);
		setAppSetting.mockImplementationOnce(() => {
			throw new Error("disk full");
		});
		expect(loadAppSetting<unknown>("yanjing.editor.preferences")).toEqual({ foo: 1 });
	});
});
