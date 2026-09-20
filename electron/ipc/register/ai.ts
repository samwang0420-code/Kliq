/**
 * Kliq — AI 相关 IPC handlers
 *
 * P0/P1 AI 接入主流程所需:
 * - ai-extract-audio: 从视频文件提取音频 (Web Audio API 解码后 wav blob)
 * - ai-read-file-as-blob: 读取本地文件为 Blob (给 hook 喂 file 参数)
 */

import { ipcMain } from "electron";
import { readFile } from "node:fs/promises";
import path from "node:path";

export function registerAIHandlers(): void {
	/**
	 * 读取本地文件为 Blob (传给 AI 函数)
	 *
	 * 渲染进程拿到 Buffer + mimeType 后自己 new Blob([buffer], { type: mimeType })
	 */
	ipcMain.handle(
		"ai-read-file-as-buffer",
		async (_event, filePath: string): Promise<{ ok: true; buffer: number[]; mimeType: string } | { ok: false; error: string }> => {
			try {
				if (!filePath) return { ok: false, error: "empty path" };
				const buffer = await readFile(filePath);
				const ext = path.extname(filePath).toLowerCase().replace(/^\./, "");
				const mimeType = inferMimeType(ext);
				return { ok: true, buffer: Array.from(buffer), mimeType };
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return { ok: false, error: msg };
			}
		},
	);

	/**
	 * 推断文件 mime type
	 */
	ipcMain.handle(
		"ai-infer-mime-type",
		async (_event, filePath: string): Promise<string> => {
			const ext = path.extname(filePath).toLowerCase().replace(/^\./, "");
			return inferMimeType(ext);
		},
	);
}

function inferMimeType(ext: string): string {
	const map: Record<string, string> = {
		mp4: "video/mp4",
		mov: "video/quicktime",
		webm: "video/webm",
		mkv: "video/x-matroska",
		avi: "video/x-msvideo",
		mp3: "audio/mpeg",
		wav: "audio/wav",
		m4a: "audio/mp4",
		ogg: "audio/ogg",
		flac: "audio/flac",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		png: "image/png",
		gif: "image/gif",
		webp: "image/webp",
	};
	return map[ext] ?? "application/octet-stream";
}
