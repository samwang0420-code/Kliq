import {
	DEFAULT_WEBCAM_BACKGROUND_BLUR,
	normalizeWebcamBackgroundBlurSettings,
	type WebcamBackgroundBlurSettings,
} from "../../src/lib/webcamBackgroundBlur";

export interface RecordingPreferences {
	microphoneEnabled: boolean;
	microphoneDeviceId?: string;
	noiseSuppressionMode: string;
	systemAudioEnabled: boolean;
	webcamEnabled: boolean;
	webcamDeviceId?: string;
	webcamBackgroundBlur: WebcamBackgroundBlurSettings;
}

export function normalizeRecordingPreferences(value: unknown): RecordingPreferences {
	const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
	return {
		microphoneEnabled: candidate.microphoneEnabled === true,
		microphoneDeviceId:
			typeof candidate.microphoneDeviceId === "string"
				? candidate.microphoneDeviceId
				: undefined,
		noiseSuppressionMode:
			typeof candidate.noiseSuppressionMode === "string"
				? candidate.noiseSuppressionMode
				: "rnnoise",
		systemAudioEnabled: candidate.systemAudioEnabled === true,
		webcamEnabled: candidate.webcamEnabled === true,
		webcamDeviceId:
			typeof candidate.webcamDeviceId === "string" ? candidate.webcamDeviceId : undefined,
		webcamBackgroundBlur: normalizeWebcamBackgroundBlurSettings(
			candidate.webcamBackgroundBlur ?? DEFAULT_WEBCAM_BACKGROUND_BLUR,
		),
	};
}
