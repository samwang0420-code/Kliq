import { describe, expect, it } from "vitest";

import {
	buildSourceAudioFallbackPaths,
	resolveSourceAudioFallbackPaths,
} from "./sourceAudioFallback";

describe("resolveSourceAudioFallbackPaths", () => {
	it("treats the video file path as embedded source audio when present in the fallback list", () => {
		const videoPath = "/tmp/recording.mp4";

		expect(
			resolveSourceAudioFallbackPaths(videoPath, [videoPath, "/tmp/recording.mic.wav"]),
		).toEqual({
			hasEmbeddedSourceAudio: true,
			externalAudioPaths: ["/tmp/recording.mic.wav"],
		});
	});

	it("keeps all fallback paths external when the video has no embedded source audio", () => {
		expect(
			resolveSourceAudioFallbackPaths("/tmp/recording.mp4", [
				"/tmp/recording.system.wav",
				"/tmp/recording.mic.wav",
			]),
		).toEqual({
			hasEmbeddedSourceAudio: false,
			externalAudioPaths: ["/tmp/recording.system.wav", "/tmp/recording.mic.wav"],
		});
	});

	it("matches embedded source audio when the video resource is a file URL", () => {
		expect(
			resolveSourceAudioFallbackPaths("file:///tmp/recording.mp4", [
				"/tmp/recording.mp4",
				"/tmp/recording.mic.wav",
			]),
		).toEqual({
			hasEmbeddedSourceAudio: true,
			externalAudioPaths: ["/tmp/recording.mic.wav"],
		});
	});

	it("normalizes Windows file URLs and local paths when checking embedded audio", () => {
		expect(
			resolveSourceAudioFallbackPaths("file:///C:/Users/Egg/Videos/recording.mp4", [
				"C:\\Users\\Egg\\Videos\\recording.mp4",
				"C:\\Users\\Egg\\Videos\\recording.mic.wav",
			]),
		).toEqual({
			hasEmbeddedSourceAudio: true,
			externalAudioPaths: ["C:\\Users\\Egg\\Videos\\recording.mic.wav"],
		});
	});

	it("matches Windows paths case-insensitively for embedded audio detection", () => {
		expect(
			resolveSourceAudioFallbackPaths("file:///C:/Users/Egg/Videos/recording.mp4", [
				"c:\\users\\egg\\videos\\recording.mp4",
				"c:\\users\\egg\\videos\\recording.mic.wav",
			]),
		).toEqual({
			hasEmbeddedSourceAudio: true,
			externalAudioPaths: ["c:\\users\\egg\\videos\\recording.mic.wav"],
		});
	});
});

/**
 * 这一组是 #984 / #792 的回归护栏。
 *
 * 曾经的 bug：源视频内嵌了桌面音频、又存在 mic sidecar 时，浏览器导出只把
 * sidecar 交给 AudioProcessor，**内嵌的桌面音频被静默丢掉**（导出成片里只剩
 * 麦克风）。native 计划走的是归一化列表所以没事，浏览器路径直接传的是原始
 * config 列表 —— 同一个决策写了两遍，改了一处漏了另一处。
 */
describe("buildSourceAudioFallbackPaths", () => {
	const videoPath = "/tmp/recording.mp4";
	const micPath = "/tmp/recording.mic.wav";

	it("keeps embedded desktop audio when a microphone sidecar is the only source path", () => {
		// 回归核心：只给了 mic，也要把视频自身补进来
		expect(
			buildSourceAudioFallbackPaths({
				videoSourcePath: videoPath,
				hasVideoAudio: true,
				sourceAudioFallbackPaths: [micPath],
			}),
		).toEqual([videoPath, micPath]);
	});

	it("keeps embedded desktop audio ahead of multiple sidecars", () => {
		const systemPath = "/tmp/recording.system.wav";

		expect(
			buildSourceAudioFallbackPaths({
				videoSourcePath: videoPath,
				hasVideoAudio: true,
				sourceAudioFallbackPaths: [systemPath, micPath],
			}),
		).toEqual([videoPath, systemPath, micPath]);
	});

	it("does not duplicate the video path when it is already in the list", () => {
		expect(
			buildSourceAudioFallbackPaths({
				videoSourcePath: videoPath,
				hasVideoAudio: true,
				sourceAudioFallbackPaths: [videoPath, micPath],
			}),
		).toEqual([videoPath, micPath]);
	});

	it("does not duplicate when the video is listed as a file URL and the source is a local path", () => {
		expect(
			buildSourceAudioFallbackPaths({
				videoSourcePath: "/tmp/recording.mp4",
				hasVideoAudio: true,
				sourceAudioFallbackPaths: ["file:///tmp/recording.mp4", micPath],
			}),
		).toEqual(["/tmp/recording.mp4", micPath]);
	});

	it("does not duplicate Windows paths that differ only by separators or case", () => {
		expect(
			buildSourceAudioFallbackPaths({
				videoSourcePath: "C:\\Videos\\recording.mp4",
				hasVideoAudio: true,
				sourceAudioFallbackPaths: [
					"c:/videos/recording.mp4",
					"C:\\Videos\\recording.mic.wav",
				],
			}),
		).toEqual(["C:\\Videos\\recording.mp4", "C:\\Videos\\recording.mic.wav"]);
	});

	it("leaves a microphone-only list alone when the video has no embedded audio", () => {
		expect(
			buildSourceAudioFallbackPaths({
				videoSourcePath: videoPath,
				hasVideoAudio: false,
				sourceAudioFallbackPaths: [micPath],
			}),
		).toEqual([micPath]);
	});

	it("cannot inject embedded audio when the video has no resolvable local path", () => {
		expect(
			buildSourceAudioFallbackPaths({
				videoSourcePath: null,
				hasVideoAudio: true,
				sourceAudioFallbackPaths: [micPath],
			}),
		).toEqual([micPath]);
	});

	it("returns no paths when an embedded-audio video has no sidecars", () => {
		expect(
			buildSourceAudioFallbackPaths({
				videoSourcePath: videoPath,
				hasVideoAudio: true,
				sourceAudioFallbackPaths: [],
			}),
		).toEqual([]);
	});

	it("drops blank entries instead of passing them to the audio processor", () => {
		expect(
			buildSourceAudioFallbackPaths({
				videoSourcePath: videoPath,
				hasVideoAudio: true,
				sourceAudioFallbackPaths: ["", "   ", micPath],
			}),
		).toEqual([videoPath, micPath]);
	});

	it("tolerates undefined config values", () => {
		expect(
			buildSourceAudioFallbackPaths({
				videoSourcePath: undefined,
				hasVideoAudio: true,
				sourceAudioFallbackPaths: undefined,
			}),
		).toEqual([]);
	});
});
