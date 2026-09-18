/**
 * 言镜 — AI 音轨文件加载 Hook (P0/P1 接入主流程关键)
 *
 * 用 electronAPI.aiReadFileAsBuffer 把本地文件转 Blob, 给 AI 函数喂 file 参数
 * 同时支持:
 * 1. 用户在 ExportSettingsMenu 点 "选择视频/音频" → 弹文件选择对话框
 * 2. 拿到 filePath → 转 Blob → 注入 useAIActions 的 runAction params.file
 */

import { useState, useCallback } from "react";

export type AIAudioFileState = {
	file: File | null;
	filePath: string | null;
	mimeType: string;
	error: string | null;
};

type ElectronAI = {
	aiReadFileAsBuffer: (filePath: string) => Promise<
		{ ok: true; buffer: number[]; mimeType: string } | { ok: false; error: string }
	>;
	aiInferMimeType: (filePath: string) => Promise<string>;
	openVideoFilePicker?: (options?: { includeProjects?: boolean }) => Promise<unknown>;
};

function getElectronAI(): ElectronAI | null {
	const api = (
		globalThis as typeof globalThis & { electronAPI?: ElectronAI }
	).electronAPI;
	if (!api || typeof api.aiReadFileAsBuffer !== "function") {
		return null;
	}
	return api;
}

export function useAIAudioFile() {
	const [state, setState] = useState<AIAudioFileState>({
		file: null,
		filePath: null,
		mimeType: "",
		error: null,
	});

	const loadFile = useCallback(async (filePath: string) => {
		const api = getElectronAI();
		if (!api) {
			setState({ file: null, filePath: null, mimeType: "", error: "AI IPC 不可用, 请检查 Electron preload 是否注入" });
			return null;
		}
		const result = await api.aiReadFileAsBuffer(filePath);
		if (!result.ok) {
			setState({ file: null, filePath, mimeType: "", error: result.error });
			return null;
		}
		const buffer = new Uint8Array(result.buffer);
		const file = new File([buffer], filePath.split("/").pop() ?? "audio", {
			type: result.mimeType,
		});
		setState({ file, filePath, mimeType: result.mimeType, error: null });
		return file;
	}, []);

	const clearFile = useCallback(() => {
		setState({ file: null, filePath: null, mimeType: "", error: null });
	}, []);

	/** 调 Recordly 上游的视频选择对话框 */
	const pickVideo = useCallback(async () => {
		const api = getElectronAI();
		if (!api?.openVideoFilePicker) {
			setState((s) => ({ ...s, error: "openVideoFilePicker 不可用" }));
			return null;
		}
		const result = (await api.openVideoFilePicker()) as
			| { success: true; path: string; kind?: string }
			| { success: false; canceled?: boolean; message?: string }
			| undefined;
		if (!result || !("success" in result) || !result.success) {
			setState((s) => ({ ...s, error: "用户取消或选择失败" }));
			return null;
		}
		return await loadFile(result.path);
	}, [loadFile]);

	/** HTML5 file input 选择 (浏览器 fallback) */
	const pickFromInput = useCallback((file: File) => {
		setState({
			file,
			filePath: file.name,
			mimeType: file.type,
			error: null,
		});
		return file;
	}, []);

	return {
		...state,
		loadFile,
		clearFile,
		pickVideo,
		pickFromInput,
		hasFile: state.file !== null,
		isElectron: getElectronAI() !== null,
	};
}
