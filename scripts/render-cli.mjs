#!/usr/bin/env node
/**
 * Kliq headless render CLI — 无 GUI 渲染 .kliq/.recordly 项目（上游 PR #864 / W09）
 *
 * 用法：
 *   npm run render -- <project> --out <file.mp4> [选项]
 *
 * 例：
 *   npm run render -- ~/Desktop/demo.kliq --out ~/Desktop/demo.mp4
 *   npm run render -- demo.kliq --out demo.mp4 --native --quality high
 *
 * 原理：应用本身已经有一条无头渲染通道（RECORDLY_SMOKE_EXPORT=1 时主进程
 * 直接创建编辑器窗口做导出、完成后退出，见 electron/main.ts），但它是给 CI
 * 用的内部约定。本脚本把它包装成正式的命令行入口：解析参数 → 校验输入 →
 * spawn electron → 透传输出 → 透传退出码。
 *
 * 与上游 #864 的差异：上游把参数解析放在主进程里；本仓选择放脚本侧，
 * 主进程不需要为 CLI 增加任何分支 —— 环境变量就是渲染参数的唯一真源。
 *
 * 退出码：0 = 成功；1 = 参数/输入错误；其它 = electron 进程原样退出码。
 */

import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);

function usage(code = 1) {
	console.log(`Usage: npm run render -- <project.kliq> --out <output.mp4> [options]

Options:
  --out <file>            Output video path (required)
  --native                Use the native FFmpeg export pipeline
  --quality <q>           low | medium | high | source
  --encoding <mode>       Encoding mode (see export settings)
  --webcam <file>         Overlay a webcam video
  --pipeline <name>       Export pipeline override
  --backend <name>        Export backend override
`);
	process.exit(code);
}

function parseArgs(argv) {
	const args = { _: [] };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--out") args.out = argv[++i];
		else if (a === "--native") args.native = true;
		else if (a === "--quality") args.quality = argv[++i];
		else if (a === "--encoding") args.encoding = argv[++i];
		else if (a === "--webcam") args.webcam = argv[++i];
		else if (a === "--pipeline") args.pipeline = argv[++i];
		else if (a === "--backend") args.backend = argv[++i];
		else if (a === "--help" || a === "-h") usage(0);
		else if (a.startsWith("--")) {
			console.error(`Unknown option: ${a}`);
			usage(1);
		} else args._.push(a);
	}
	return args;
}

const args = parseArgs(process.argv.slice(2));
if (args._.length !== 1 || !args.out) {
	console.error("Error: exactly one <project> and --out <file> are required.");
	usage(1);
}

const projectPath = path.resolve(args._[0]);
if (!existsSync(projectPath)) {
	console.error(`Error: project not found: ${projectPath}`);
	process.exit(1);
}
const isFile = statSync(projectPath).isFile();
if (!isFile) {
	console.error(`Error: project is not a file: ${projectPath}`);
	process.exit(1);
}

const outputPath = path.resolve(args.out);
if (!/\.mp4$/i.test(outputPath)) {
	console.error("Error: output must be an .mp4 path");
	process.exit(1);
}
if (existsSync(outputPath)) {
	console.error(`Error: output already exists (will not overwrite): ${outputPath}`);
	process.exit(1);
}

const electron = path.join(repoRoot, "node_modules", ".bin", "electron");
if (!existsSync(electron)) {
	console.error("Error: electron binary not found. Run `npm install` first.");
	process.exit(1);
}

const child = spawn(electron, [repoRoot], {
	cwd: repoRoot,
	env: {
		...process.env,
		RECORDLY_SMOKE_EXPORT: "1",
		RECORDLY_SMOKE_EXPORT_INPUT: projectPath,
		RECORDLY_SMOKE_EXPORT_OUTPUT: outputPath,
		...(args.native ? { RECORDLY_SMOKE_EXPORT_USE_NATIVE: "1" } : {}),
		...(args.quality ? { RECORDLY_SMOKE_EXPORT_QUALITY: args.quality } : {}),
		...(args.encoding ? { RECORDLY_SMOKE_EXPORT_ENCODING_MODE: args.encoding } : {}),
		...(args.webcam ? { RECORDLY_SMOKE_EXPORT_WEBCAM_INPUT: path.resolve(args.webcam) } : {}),
		...(args.pipeline ? { RECORDLY_SMOKE_EXPORT_PIPELINE: args.pipeline } : {}),
		...(args.backend ? { RECORDLY_SMOKE_EXPORT_BACKEND: args.backend } : {}),
		ELECTRON_ENABLE_LOGGING: process.env.ELECTRON_ENABLE_LOGGING ?? "1",
	},
	stdio: "inherit",
});

child.on("exit", (code, signal) => {
	if (signal) {
		console.error(`render-cli: terminated by ${signal}`);
		process.exit(1);
	}
	if (code === 0) {
		console.log(`render-cli: done → ${outputPath}`);
	} else {
		console.error(`render-cli: export failed with exit code ${code}`);
	}
	process.exit(code ?? 1);
});

child.on("error", (error) => {
	console.error(`render-cli: failed to launch electron: ${error.message}`);
	process.exit(1);
});
