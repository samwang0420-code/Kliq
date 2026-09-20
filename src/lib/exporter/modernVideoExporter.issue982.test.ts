import { describe, expect, it, vi } from "vitest";
import type { AudioRegion, SpeedRegion, ZoomRegion } from "@/components/video-editor/types";
import { ModernVideoExporter } from "./modernVideoExporter";
import type { DecodedVideoInfo } from "./streamingDecoder";

// Upstream issue #982: Windows users record with the system-audio toggle on,
// the screen capture ends up as a video-only mp4 with a `.system.wav` sidecar,
// and the exported mp4 has no audio. PR #987 already routed the renderer-side
// audio through offline rendering for WAV sidecars; this set of tests covers
// the parallel case for the native fast-path audio plan.

const videoInfoWindowsSystemAudio: DecodedVideoInfo = {
	width: 1920,
	height: 1080,
	duration: 60,
	streamDuration: 60,
	frameRate: 30,
	codec: "h264",
	hasAudio: false, // SCStream on macOS / Windows native helper writes no embedded audio
	audioCodec: undefined,
	audioSampleRate: undefined,
};

const videoInfoWithEmbeddedAudio: DecodedVideoInfo = {
	...videoInfoWindowsSystemAudio,
	hasAudio: true,
	audioCodec: "aac",
	audioSampleRate: 48_000,
};

function createExporter(overrides: Record<string, unknown> = {}) {
	vi.stubGlobal("window", {
		electronAPI: {
			nativeStaticLayoutExport: vi.fn(),
			nativeStaticLayoutExportCancel: vi.fn(),
		},
	});

	return new ModernVideoExporter({
		videoUrl: "file:///C:/Users/Test/recording.mp4",
		width: 1920,
		height: 1080,
		frameRate: 30,
		bitrate: 8_000_000,
		wallpaper: "#101010",
		padding: 0,
		borderRadius: 0,
		backgroundBlur: 0,
		shadowIntensity: 0,
		showShadow: false,
		cropRegion: { x: 0, y: 0, width: 1, height: 1 },
		experimentalNativeExport: true,
		...overrides,
	} as never) as unknown as {
		buildNativeAudioPlan: (videoInfo: DecodedVideoInfo) => unknown;
	};
}

describe("§982 native audio plan with WAV sidecar", () => {
	it("routes a Windows system.wav sidecar through offline rendering instead of copy-source", () => {
		const exporter = createExporter({
			sourceAudioFallbackPaths: ["C:\\Users\\Test\\recording.system.wav"],
		});
		const plan = exporter.buildNativeAudioPlan(videoInfoWindowsSystemAudio) as {
			audioMode: string;
			strategy?: string;
			sourceAudioFallbackPaths?: string[];
		};
		// copy-source relies on FFmpeg to inline-transcode a raw WAV into
		// the mp4 container; on the affected Windows builds this silently
		// drops the audio track (issue #982). Offline rendering decodes the
		// WAV to PCM via AudioContext and re-encodes to AAC via the WebCodecs
		// AudioEncoder, which is the path that actually ships audio.
		expect(plan.audioMode).toBe("edited-track");
		expect(plan.strategy).toBe("offline-render-fallback");
		expect(plan.sourceAudioFallbackPaths).toEqual(["C:\\Users\\Test\\recording.system.wav"]);
	});

	it("still uses copy-source for AAC-embedded video with no sidecar", () => {
		const exporter = createExporter();
		const plan = exporter.buildNativeAudioPlan(videoInfoWithEmbeddedAudio) as {
			audioMode: string;
			audioSourceCodec?: string;
		};
		expect(plan.audioMode).toBe("copy-source");
		expect(plan.audioSourceCodec).toBe("aac");
	});

	it("routes a Windows mic.wav sidecar through offline rendering too", () => {
		const exporter = createExporter({
			sourceAudioFallbackPaths: ["C:\\Users\\Test\\recording.mic.wav"],
		});
		const plan = exporter.buildNativeAudioPlan(videoInfoWindowsSystemAudio) as {
			audioMode: string;
		};
		expect(plan.audioMode).toBe("edited-track");
	});

	it("does not change behavior for an mp4-embedded fallback path", () => {
		const exporter = createExporter({
			sourceAudioFallbackPaths: ["C:\\Users\\Test\\recording.mic.m4a"],
		});
		const plan = exporter.buildNativeAudioPlan(videoInfoWindowsSystemAudio) as {
			audioMode: string;
		};
		// .m4a can be re-encoded by FFmpeg inline, so copy-source stays.
		expect(plan.audioMode).toBe("copy-source");
	});

	it("routes the system+mic combination through offline rendering", () => {
		const exporter = createExporter({
			sourceAudioFallbackPaths: [
				"C:\\Users\\Test\\recording.system.wav",
				"C:\\Users\\Test\\recording.mic.wav",
			],
		});
		const plan = exporter.buildNativeAudioPlan(videoInfoWindowsSystemAudio) as {
			audioMode: string;
		};
		expect(plan.audioMode).toBe("edited-track");
	});

	it("still uses edited-track when the source audio is a URL-encoded media-server WAV", () => {
		const exporter = createExporter({
			sourceAudioFallbackPaths: [
				"http://localhost:4321/video?path=C%3A%5CUsers%5CTest%5Crecording.system.wav&sig=abc",
			],
		});
		const plan = exporter.buildNativeAudioPlan(videoInfoWindowsSystemAudio) as {
			audioMode: string;
		};
		expect(plan.audioMode).toBe("edited-track");
	});
});
