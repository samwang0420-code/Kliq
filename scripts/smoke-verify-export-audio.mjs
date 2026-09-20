#!/usr/bin/env node
/**
 * Kliq — `verify-export-audio.mjs` 的自检
 *
 * 一个验收器如果自己烂掉了，比没有验收器更危险：它会稳定地报「通过」。
 * 这里用 ffmpeg 现场造 4 个**属性已知**的样本，然后断言验收器的判定结果：
 *
 *   ok_audio         有音轨、有声        → 必须通过
 *   silent_video     完全没有音轨        → 加 --expect-audio 必须不通过
 *                                        → 加 --expect-no-audio 必须通过
 *   digital_silence  音轨在但全是 0 采样 → 必须不通过；加 --allow-digital-silence 必须通过
 *   short_audio      音频 2s / 视频 6s   → 必须因时长比不通过
 *
 * 没有 ffmpeg/ffprobe 时**跳过**（退出 0），这样在没装 ffmpeg 的 CI 上不会假红。
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

const SCRIPT = path.join(import.meta.dirname, "verify-export-audio.mjs");

function has(binary) {
	const probe = spawnSync(binary, ["-version"], { encoding: "utf8" });
	return !probe.error && probe.status === 0;
}

function runFfmpeg(args, cwd) {
	const result = spawnSync("ffmpeg", args, { cwd, encoding: "utf8" });
	if (result.status !== 0) {
		throw new Error(`ffmpeg 生成样本失败：${(result.stderr || "").slice(-400)}`);
	}
}

function runVerifier(args) {
	const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
	return { code: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

function main() {
	if (!has("ffmpeg") || !has("ffprobe")) {
		process.stdout.write("跳过：本机没有 ffmpeg/ffprobe。\n");
		return 0;
	}

	const dir = mkdtempSync(path.join(tmpdir(), "kliq-audio-smoke-"));
	const failures = [];
	let assertionCount = 0;

	const base = ["-v", "error", "-y"];
	const videoOnly = ["-f", "lavfi", "-i", "color=c=black:s=320x240:d=3"];
	const x264 = ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"];

	try {
		runFfmpeg(
			[
				...base,
				...videoOnly,
				"-f",
				"lavfi",
				"-i",
				"sine=frequency=440:duration=3",
				...x264,
				"-c:a",
				"aac",
				"-shortest",
				"ok_audio.mp4",
			],
			dir,
		);
		runFfmpeg([...base, ...videoOnly, ...x264, "-an", "silent_video.mp4"], dir);
		runFfmpeg(
			[
				...base,
				...videoOnly,
				"-f",
				"lavfi",
				"-i",
				"anullsrc=channel_layout=stereo:sample_rate=48000",
				"-t",
				"3",
				...x264,
				"-c:a",
				"aac",
				"-shortest",
				"digital_silence.mp4",
			],
			dir,
		);
		// 这里**不能**加 -shortest：它会把输出截到最短的那路输入（2s），
		// 于是音频与视频一样长，就测不出「时长远不匹配」这件事了。
		// 不加 -shortest 时容器跟到最长流：6s 视频 + 2s 音频，才是我们要的样本。
		runFfmpeg(
			[
				...base,
				"-f",
				"lavfi",
				"-i",
				"color=c=black:s=320x240:d=6",
				"-f",
				"lavfi",
				"-i",
				"sine=frequency=440:duration=2",
				...x264,
				"-c:a",
				"aac",
				"short_audio.mp4",
			],
			dir,
		);

		// 注意：只把**文件名**接到临时目录上，选项必须原样传，
		// 否则 `--expect-no-audio` 会被当成一个不存在的文件（退出码 2）。
		const cases = [
			{ name: "有声样本必须通过", file: "ok_audio.mp4", flags: [], expect: 0 },
			{
				name: "无音轨样本在 --expect-audio 下必须不通过",
				file: "silent_video.mp4",
				flags: [],
				expect: 1,
				mustMention: "没有任何 audio stream",
			},
			{
				name: "无音轨样本在 --expect-no-audio 下必须通过",
				file: "silent_video.mp4",
				flags: ["--expect-no-audio"],
				expect: 0,
			},
			{
				name: "数字静音样本必须不通过",
				file: "digital_silence.mp4",
				flags: [],
				expect: 1,
				mustMention: "数字静音",
			},
			{
				name: "数字静音样本在 --allow-digital-silence 下必须通过",
				file: "digital_silence.mp4",
				flags: ["--allow-digital-silence"],
				expect: 0,
			},
			{
				name: "音频时长远短于视频必须不通过",
				file: "short_audio.mp4",
				flags: ["--max-duration-ratio", "2"],
				expect: 1,
				mustMention: "音频比视频短",
			},
			{
				name: "通道数不符必须不通过",
				file: "ok_audio.mp4",
				flags: ["--expect-channels", "2"],
				expect: 1,
				mustMention: "期望 2 通道",
			},
		];

		assertionCount = cases.length;
		for (const testCase of cases) {
			const result = runVerifier([path.join(dir, testCase.file), ...testCase.flags]);
			if (result.code !== testCase.expect) {
				failures.push(
					`${testCase.name}：期望退出码 ${testCase.expect}，实际 ${result.code}\n` +
						result.output
							.split("\n")
							.filter((line) => line.includes("✗"))
							.join("\n"),
				);
				continue;
			}
			if (testCase.mustMention && !result.output.includes(testCase.mustMention)) {
				failures.push(
					`${testCase.name}：输出里没有出现「${testCase.mustMention}」，判定的可能是别的原因`,
				);
			}
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}

	if (failures.length === 0) {
		process.stdout.write(`音频验收器自检通过（${assertionCount} 个断言）。\n`);
		return 0;
	}
	process.stderr.write(`音频验收器自检失败：\n\n${failures.join("\n\n")}\n`);
	return 1;
}

process.exit(main());
