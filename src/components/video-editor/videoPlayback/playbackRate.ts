const supportedRates = new Map<number, boolean>();

/** Ask the runtime rather than assuming every platform accepts the same rates. */
export function supportsPreviewPlaybackRate(rate: number): boolean {
	if (!Number.isFinite(rate) || rate <= 0) return false;
	const cached = supportedRates.get(rate);
	if (cached !== undefined) return cached;
	const video = document.createElement("video");
	try {
		video.playbackRate = rate;
		supportedRates.set(rate, true);
		return true;
	} catch (error) {
		if (!(error instanceof DOMException) || error.name !== "NotSupportedError") throw error;
		supportedRates.set(rate, false);
		return false;
	}
}
