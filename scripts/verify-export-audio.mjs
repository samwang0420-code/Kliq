#!/usr/bin/env node
/**
 * Kliq — 导出音频产物验收器
 *
 * 为什么需要它：`#984`（浏览器导出丢掉内嵌桌面音频）这类 bug 的修法一直卡在
 * 「无法端到端验证音频产物」上——只能靠人戴上耳机听一遍，于是修复永远只能
 * 说「看起来对」。这个脚本把音频产物变成可断言的东西：
 *
 *   1. 有没有音轨            — 对应「导出成片完全没声音」
 *   2. 音轨是不是数字静音     — 对应「音轨在、但全是 0 采样」
 *   3. 通道数 / 采样率 / 编码 — 对应「单声道/立体声搞错」
 *   4. 音频时长 vs 视频时长    — 对应「音画不同步、末尾截断」
 *
 * 它不做的事（诚实边界）：**无法判断混音内容对不对**。比如「本该是桌面音频 +
 * 麦克风混音，结果只混了麦克风」——这种错误音轨照样存在、照样不是静音。
 * 那类问题的护栏是单测（见 src/lib/exporter/sourceAudioFallback.test.ts），
 * 不是这个脚本。别把它当成万能证明。
 *
 * 用法：
 *   node scripts/verify-export-audio.mjs out.mp4
 *   node scripts/verify-export-audio.mjs out.mp4 --expect-no-audio
 *   node scripts/verify-export-audio.mjs out.mp4 --min-duration-ratio 0.95 --expect-channels 2
 *   node scripts/verify-export-audio.mjs dist/*.mp4 --json
 *
 * 退出码：全部通过 0；任一文件不通过 1；用法/环境错误 2。
 */

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const USAGE = `用法: node scripts/verify-export-audio.mjs <文件…> [选项]

选项:
  --expect-audio              必须有音轨（默认）
  --expect-no-audio           必须没有音轨（验证「静音源不该凭空造出音轨」）
  --expect-channels <n>       音轨通道数必须等于 n
  --min-duration-ratio <r>    音频时长 / 视频时长 >= r（默认 0.9）
  --max-duration-ratio <r>    音频时长 / 视频时长 <= r（默认 1.1）
  --min-max-volume-db <db>    音轨峰值必须高于该值，否则判为数字静音（默认 -90）
  --allow-digital-silence     关闭数字静音判定
  --json                      以 JSON 输出结果
  -h, --help                  显示本帮助
`;

function parseArgs(argv) {
	const options = {
		files: [],
		expectAudio: true,
		expectChannels: null,
		minDurationRatio: 0.9,
		maxDurationRatio: 1.1,
		minMaxVolumeDb: -90,
		allowDigitalSilence: false,
		json: false,
	};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		const next = () => {
			const value = argv[i + 1];
			if (value === undefined) throw new Error(`${arg} 缺参数`);
			i += 1;
			return value;
		};
		switch (arg) {
			case "--expect-audio":
				options.expectAudio = true;
				break;
			case "--expect-no-audio":
				options.expectAudio = false;
				break;
			case "--expect-channels":
				options.expectChannels = Number.parseInt(next(), 10);
				break;
			case "--min-duration-ratio":
				options.minDurationRatio = Number.parseFloat(next());
				break;
			case "--max-duration-ratio":
				options.maxDurationRatio = Number.parseFloat(next());
				break;
			case "--min-max-volume-db":
				options.minMaxVolumeDb = Number.parseFloat(next());
				break;
			case "--allow-digital-silence":
				options.allowDigitalSilence = true;
				break;
			case "--json":
				options.json = true;
				break;
			case "-h":
			case "--help":
				process.stdout.write(USAGE);
				process.exit(0);
				break;
			default:
				if (arg.startsWith("-")) throw new Error(`未知选项: ${arg}`);
				options.files.push(arg);
		}
	}
	if (options.files.length === 0) throw new Error("至少要给一个文件");
	return options;
}

function requireBinary(name) {
	const probe = spawnSync(name, ["-version"], { encoding: "utf8" });
	if (probe.error || probe.status !== 0) {
		throw new Error(
			`找不到 ${name}。这个脚本依赖本机 ffprobe/ffmpeg；` +
				`请先安装（brew install ffmpeg），或把 ${name} 放进 PATH。`,
		);
	}
}

function ffprobeJson(file) {
	const result = spawnSync(
		"ffprobe",
		["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
		{ encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
	);
	if (result.error) throw new Error(`ffprobe 执行失败: ${result.error.message}`);
	if (result.status !== 0) {
		throw new Error(`ffprobe 无法解析 ${file}: ${(result.stderr || "").trim().slice(0, 300)}`);
	}
	try {
		return JSON.parse(result.stdout);
	} catch (error) {
		throw new Error(`ffprobe 输出不是合法 JSON: ${error.message}`);
	}
}

/**
 * 用 volumedetect 拿到峰值/均值电平。
 * 数字静音（全 0 采样）时 max_volume 会是 -91.0 dB 或 -inf。
 */
function detectVolume(file) {
	const result = spawnSync(
		"ffmpeg",
		[
			"-hide_banner",
			"-nostdin",
			"-i",
			file,
			"-map",
			"0:a:0",
			"-af",
			"volumedetect",
			"-f",
			"null",
			"-",
		],
		{ encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
	);
	if (result.error) return { available: false, reason: result.error.message };
	const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
	const mean = /mean_volume:\s*(-?[\d.]+|-inf)\s*dB/.exec(text);
	const max = /max_volume:\s*(-?[\d.]+|-inf)\s*dB/.exec(text);
	if (!mean && !max) {
		return { available: false, reason: "volumedetect 未输出电平（可能没有音轨）" };
	}
	const toNumber = (match) => {
		if (!match) return null;
		return match[1] === "-inf" ? Number.NEGATIVE_INFINITY : Number.parseFloat(match[1]);
	};
	return { available: true, meanVolumeDb: toNumber(mean), maxVolumeDb: toNumber(max) };
}

function toSeconds(value) {
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function verifyFile(file, options) {
	const failures = [];
	const notes = [];

	const probe = ffprobeJson(file);
	const streams = Array.isArray(probe.streams) ? probe.streams : [];
	const audio = streams.find((stream) => stream.codec_type === "audio") ?? null;
	const video = streams.find((stream) => stream.codec_type === "video") ?? null;

	if (!options.expectAudio && audio) {
		failures.push(`期望没有音轨，实际有 1 条（${audio.codec_name ?? "unknown"}）`);
	}
	if (options.expectAudio && !audio) {
		failures.push("期望有音轨，实际没有任何 audio stream");
	}

	let volume = { available: false, reason: "无音轨" };
	if (audio) {
		if (options.expectChannels !== null && Number(audio.channels) !== options.expectChannels) {
			failures.push(
				`期望 ${options.expectChannels} 通道，实际 ${audio.channels ?? "?"} 通道`,
			);
		}
		if (!options.allowDigitalSilence) {
			volume = detectVolume(file);
			if (volume.available && volume.maxVolumeDb !== null) {
				if (volume.maxVolumeDb <= options.minMaxVolumeDb) {
					failures.push(
						`音轨是数字静音（峰值 ${volume.maxVolumeDb} dB ≤ ${options.minMaxVolumeDb} dB）` +
							"—— 音轨在，但全是 0 采样",
					);
				}
			} else {
				notes.push(`跳过静音判定：${volume.reason ?? "未知原因"}`);
			}
		}
	}

	const videoDuration = toSeconds(probe.format?.duration) ?? toSeconds(video?.duration);
	const audioDuration = toSeconds(audio?.duration);
	let durationRatio = null;
	if (audio && audioDuration !== null && videoDuration !== null) {
		durationRatio = audioDuration / videoDuration;
		if (durationRatio < options.minDurationRatio) {
			failures.push(
				`音频比视频短：${audioDuration.toFixed(3)}s / ${videoDuration.toFixed(3)}s = ` +
					`${durationRatio.toFixed(3)} < ${options.minDurationRatio}`,
			);
		}
		if (durationRatio > options.maxDurationRatio) {
			failures.push(
				`音频比视频长：${audioDuration.toFixed(3)}s / ${videoDuration.toFixed(3)}s = ` +
					`${durationRatio.toFixed(3)} > ${options.maxDurationRatio}`,
			);
		}
	} else if (audio && audioDuration === null) {
		notes.push("容器没给出音轨时长（流式 mux 常见），跳过时长比例判定");
	}

	return {
		file,
		sizeBytes: statSync(file).size,
		ok: failures.length === 0,
		failures,
		notes,
		video: video
			? {
					codec: video.codec_name ?? null,
					width: video.width ?? null,
					height: video.height ?? null,
					durationSec: toSeconds(video.duration),
				}
			: null,
		audio: audio
			? {
					codec: audio.codec_name ?? null,
					channels: audio.channels ?? null,
					sampleRate: audio.sample_rate ? Number(audio.sample_rate) : null,
					durationSec: audioDuration,
				}
			: null,
		containerDurationSec: videoDuration,
		durationRatio,
		volume,
	};
}

function main() {
	let options;
	try {
		options = parseArgs(process.argv.slice(2));
	} catch (error) {
		process.stderr.write(`${error.message}\n\n${USAGE}`);
		process.exit(2);
	}

	try {
		requireBinary("ffprobe");
		if (!options.allowDigitalSilence) requireBinary("ffmpeg");
	} catch (error) {
		process.stderr.write(`${error.message}\n`);
		process.exit(2);
	}

	const missing = options.files.filter((file) => !existsSync(file));
	if (missing.length > 0) {
		process.stderr.write(`文件不存在：\n${missing.map((f) => `  ${f}`).join("\n")}\n`);
		process.exit(2);
	}

	let results;
	try {
		results = options.files.map((file) => verifyFile(file, options));
	} catch (error) {
		process.stderr.write(`${error.message}\n`);
		process.exit(2);
	}

	if (options.json) {
		process.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);
	} else {
		for (const result of results) {
			const mark = result.ok ? "通过" : "不通过";
			process.stdout.write(`\n[${mark}] ${path.basename(result.file)}\n`);
			process.stdout.write(`  容器时长 : ${result.containerDurationSec ?? "?"} s\n`);
			if (result.audio) {
				process.stdout.write(
					`  音轨     : ${result.audio.codec} · ${result.audio.channels} ch · ` +
						`${result.audio.sampleRate ?? "?"} Hz · ${result.audio.durationSec ?? "?"} s\n`,
				);
				if (result.volume.available) {
					process.stdout.write(
						`  电平     : 峰值 ${result.volume.maxVolumeDb} dB · 均值 ` +
							`${result.volume.meanVolumeDb} dB\n`,
					);
				}
			} else {
				process.stdout.write("  音轨     : 无\n");
			}
			if (result.video) {
				process.stdout.write(
					`  画面     : ${result.video.codec} · ${result.video.width}x${result.video.height}\n`,
				);
			}
			for (const note of result.notes) process.stdout.write(`  注       : ${note}\n`);
			for (const failure of result.failures) {
				process.stdout.write(`  ✗ ${failure}\n`);
			}
		}
	}

	const failed = results.filter((result) => !result.ok);
	const total = results.length;
	if (failed.length === 0) {
		process.stdout.write(`\n${total}/${total} 个文件通过音频验收。\n`);
		return 0;
	}
	process.stdout.write(`\n${failed.length}/${total} 个文件未通过：\n`);
	for (const result of failed) process.stdout.write(`  ${result.file}\n`);
	return 1;
}

process.exit(main());
