/**
 * Kliq — useUser pure-function tests (§59-5)
 *
 * Strategy: node-env vitest (no React DOM). We only test the exported pure
 * functions (readToken, fetchMe, emitAuthChanged) plus the event-name
 * constant. The useUser() React hook itself is integration-tested later via
 * a real component render (out of scope for this commit).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_CHANGED_EVENT, emitAuthChanged, fetchMe, readToken } from "./useUser";

const memoryStorage = new Map<string, string>();

function setupBrowserGlobals() {
	// @ts-expect-error -- test stub
	globalThis.window = {
		localStorage: {
			getItem: (k: string) => (memoryStorage.has(k) ? memoryStorage.get(k)! : null),
			setItem: (k: string, v: string) => memoryStorage.set(k, v),
			removeItem: (k: string) => memoryStorage.delete(k),
		},
		dispatchEvent: () => true,
	};
	// @ts-expect-error -- test stub
	globalThis.CustomEvent = class {
		constructor(public type: string) {}
	};
}

function teardownBrowserGlobals() {
	// @ts-expect-error -- cleanup
	delete globalThis.window;
	// @ts-expect-error -- cleanup
	delete globalThis.CustomEvent;
}

beforeEach(() => {
	setupBrowserGlobals();
	memoryStorage.clear();
	vi.restoreAllMocks();
});

afterEach(() => {
	teardownBrowserGlobals();
});

describe("AUTH_CHANGED_EVENT", () => {
	it("equals 'kliq:auth-changed'", () => {
		expect(AUTH_CHANGED_EVENT).toBe("kliq:auth-changed");
	});
});

describe("emitAuthChanged()", () => {
	it("dispatches a CustomEvent of type AUTH_CHANGED_EVENT", () => {
		const spy = vi.spyOn(globalThis.window, "dispatchEvent");
		emitAuthChanged();
		expect(spy).toHaveBeenCalledTimes(1);
		const evt = spy.mock.calls[0]?.[0] as { type: string };
		expect(evt.type).toBe(AUTH_CHANGED_EVENT);
	});

	it("is a no-op when window is undefined (SSR safe)", () => {
		teardownBrowserGlobals();
		expect(() => emitAuthChanged()).not.toThrow();
	});
});

describe("readToken()", () => {
	it("returns null when localStorage has no token", () => {
		expect(readToken()).toBeNull();
	});

	it("returns null for empty string", () => {
		memoryStorage.set("kliq.auth.token", "");
		expect(readToken()).toBeNull();
	});

	it("returns null for whitespace-only string", () => {
		memoryStorage.set("kliq.auth.token", "   ");
		expect(readToken()).toBeNull();
	});

	it("trims surrounding whitespace", () => {
		memoryStorage.set("kliq.auth.token", "  abc123  ");
		expect(readToken()).toBe("abc123");
	});

	it("returns null when window is undefined (SSR safe)", () => {
		teardownBrowserGlobals();
		expect(readToken()).toBeNull();
	});

	it("returns null when localStorage throws", () => {
		// @ts-expect-error -- override getItem to throw
		globalThis.window.localStorage.getItem = () => {
			throw new Error("QuotaExceeded");
		};
		expect(readToken()).toBeNull();
	});
});

describe("fetchMe()", () => {
	it("returns null without calling fetch when KLQ_SITE_URL is empty", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const result = await fetchMe("any-token");
		expect(result).toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("returns null on 401 (token rejected)", async () => {
		vi.stubEnv("VITE_KLQ_SITE_URL", "https://kliq.example");
		vi.resetModules();
		const mod = await import("./useUser");
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("{}", { status: 401 }));
		const result = await mod.fetchMe("invalid-token");
		expect(result).toBeNull();
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const callInit = fetchSpy.mock.calls[0]?.[1] as RequestInit;
		expect((callInit.headers as Record<string, string>).Authorization).toBe(
			"Bearer invalid-token",
		);
		vi.unstubAllEnvs();
	});

	it("returns the user object on 200", async () => {
		vi.stubEnv("VITE_KLQ_SITE_URL", "https://kliq.example");
		vi.resetModules();
		const mod = await import("./useUser");
		const user = {
			id: 7,
			email: "buyer@kliq.app",
			tier: "lifetime" as const,
			createdAt: 1234567890,
		};
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ user }), { status: 200 }),
		);
		const result = await mod.fetchMe("valid-token");
		expect(result).toEqual(user);
		vi.unstubAllEnvs();
	});

	it("treats 5xx as anonymous (no throw)", async () => {
		vi.stubEnv("VITE_KLQ_SITE_URL", "https://kliq.example");
		vi.resetModules();
		const mod = await import("./useUser");
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("boom", { status: 503 }));
		const result = await mod.fetchMe("any");
		expect(result).toBeNull();
		vi.unstubAllEnvs();
	});

	it("returns null on network error (don't throw)", async () => {
		vi.stubEnv("VITE_KLQ_SITE_URL", "https://kliq.example");
		vi.resetModules();
		const mod = await import("./useUser");
		vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
		const result = await mod.fetchMe("any");
		expect(result).toBeNull();
		vi.unstubAllEnvs();
	});

	it("returns null when /api/auth/me returns 200 but no user field", async () => {
		vi.stubEnv("VITE_KLQ_SITE_URL", "https://kliq.example");
		vi.resetModules();
		const mod = await import("./useUser");
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({}), { status: 200 }),
		);
		const result = await mod.fetchMe("any");
		expect(result).toBeNull();
		vi.unstubAllEnvs();
	});
});
