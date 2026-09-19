type ElectronSettingsApi = Pick<Window["electronAPI"], "getAppSetting" | "setAppSetting">;

function getElectronSettingsApi(): ElectronSettingsApi | null {
	const api = (globalThis as typeof globalThis & { electronAPI?: ElectronSettingsApi })
		.electronAPI;
	if (
		!api ||
		typeof api.getAppSetting !== "function" ||
		typeof api.setAppSetting !== "function"
	) {
		return null;
	}

	return api;
}

// Legacy brand-key migration: when the yanjing.* key is unset but the
// original recordly.* key still holds the user's value, transparently
// read the legacy value AND copy it to the new key so future loads are
// fast. Add new entries whenever a storage key is renamed.
const LEGACY_APP_SETTING_KEYS: Readonly<Record<string, string>> = {
	"yanjing.locale": "recordly.locale",
	"yanjing.theme": "recordly.theme",
	"yanjing.editor.preferences": "recordly.editor.preferences",
	"yanjing.editor.presets": "recordly.editor.presets",
	"yanjing.export.experimentalNvidiaCuda": "recordly.export.experimentalNvidiaCuda",
};

export function loadAppSetting<T>(key: string): T | null {
	const api = getElectronSettingsApi();
	if (!api) {
		return null;
	}

	try {
		const value = api.getAppSetting(key);
		if (value !== undefined) {
			return value as T | null;
		}
		const legacyKey = LEGACY_APP_SETTING_KEYS[key];
		if (legacyKey !== undefined) {
			const legacyValue = api.getAppSetting(legacyKey);
			if (legacyValue !== undefined) {
				try {
					api.setAppSetting(key, legacyValue);
				} catch {
					// ignore — fallback will still work next time
				}
				return legacyValue as T | null;
			}
		}
		return null;
	} catch {
		return null;
	}
}

export function saveAppSetting(key: string, value: unknown): boolean {
	const api = getElectronSettingsApi();
	if (!api) {
		return false;
	}

	try {
		return api.setAppSetting(key, value);
	} catch {
		return false;
	}
}
