import { describe, expect, it, vi } from "vitest";

import {
	closeAccountCenter,
	getProGateState,
	openAccountCenter,
	requestProUpgrade,
	subscribeProGate,
} from "./proGate";

describe("proGate store", () => {
	it("starts closed with no blocked feature", () => {
		closeAccountCenter();
		expect(getProGateState()).toEqual({ centerOpen: false, blockedFeature: null });
	});

	it("opens without a blocked feature when the user clicks the entry", () => {
		openAccountCenter();
		expect(getProGateState()).toEqual({ centerOpen: true, blockedFeature: null });
	});

	it("records the blocked feature when a gate fires", () => {
		requestProUpgrade("transcribe");
		expect(getProGateState()).toEqual({
			centerOpen: true,
			blockedFeature: "transcribe",
		});
	});

	it("clears the blocked feature on close so it cannot leak into the next open", () => {
		requestProUpgrade("transcribe");
		closeAccountCenter();
		openAccountCenter();
		expect(getProGateState().blockedFeature).toBeNull();
	});

	it("notifies subscribers on every transition and stops after unsubscribe", () => {
		closeAccountCenter();
		const listener = vi.fn();
		const unsubscribe = subscribeProGate(listener);

		requestProUpgrade("captions");
		closeAccountCenter();
		expect(listener).toHaveBeenCalledTimes(2);

		unsubscribe();
		openAccountCenter();
		expect(listener).toHaveBeenCalledTimes(2);
	});
});
