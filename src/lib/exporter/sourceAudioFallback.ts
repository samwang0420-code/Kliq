import { getLocalFilePathFromResource } from "./mediaResource";

function normalizeSourceAudioFallbackPath(resourceOrPath: string): string | null {
	if (typeof resourceOrPath !== "string") {
		return null;
	}

	const resolvedPath = getLocalFilePathFromResource(resourceOrPath) ?? resourceOrPath;
	const trimmedPath = resolvedPath.trim();
	if (!trimmedPath) {
		return null;
	}

	const isWindowsPath =
		/^[A-Za-z]:[\\/]/.test(trimmedPath) || /^\\\\[^\\]+\\[^\\]+/.test(trimmedPath);
	if (isWindowsPath) {
		return trimmedPath.replace(/\//g, "\\").toLowerCase();
	}

	return trimmedPath.replace(/\\/g, "/");
}

/**
 * 决定**哪些音源应该参与混音**（native 与浏览器导出必须用同一份决策）。
 *
 * 为什么这个函数必须存在、而不是把逻辑留在 ModernVideoExporter 的私有方法里：
 *
 *   源视频**内嵌**了桌面音频、同时又存在 mic sidecar 时，上游只把
 *   `[micPath]` 这类 sidecar 列表交给 AudioProcessor，结果内嵌的桌面音频
 *   **被静默丢掉**（浏览器 WebCodecs 导出路径曾长期如此，见上游 #984/#792）。
 *
 *   修法是把本地视频源本身补回列表头部。这段"补不补、补了会不会重复"的判断
 *   此前藏在导出器的私有方法里，只被 native 计划调用；一旦有人再写第二条调用
 *   路径（浏览器路径就是），很容易又漏掉。抽成纯函数后它有了独立测试：
 *   本仓 vitest 是 node 环境，只有纯函数才可能被测试真正锁住。
 *
 * 返回规则：
 *   - 视频无内嵌音频 / 拿不到本地视频路径 → 原样返回（没有可保留的内嵌音源）
 *   - 列表里除视频自身外没有别的音源 → 原样返回（没有额外的要混）
 *   - 否则 → `[视频自身, ...其余音源]`，且**不会重复**视频路径
 */
export function buildSourceAudioFallbackPaths(input: {
	/** 本地视频文件路径；无法解析（blob:/http:）时为 null */
	videoSourcePath: string | null | undefined;
	/** 源视频是否带内嵌音频 */
	hasVideoAudio: boolean;
	/** config.sourceAudioFallbackPaths 原始值 */
	sourceAudioFallbackPaths: string[] | null | undefined;
}): string[] {
	const filteredPaths = (input.sourceAudioFallbackPaths ?? []).filter(
		(audioPath) => typeof audioPath === "string" && audioPath.trim().length > 0,
	);
	const videoSourcePath = input.videoSourcePath ?? null;
	if (!input.hasVideoAudio || !videoSourcePath) {
		return filteredPaths;
	}

	const { externalAudioPaths } = resolveSourceAudioFallbackPaths(videoSourcePath, filteredPaths);
	if (externalAudioPaths.length === 0) {
		return filteredPaths;
	}

	return [videoSourcePath, ...externalAudioPaths];
}

export function resolveSourceAudioFallbackPaths(
	videoResource: string | null | undefined,
	sourceAudioFallbackPaths: string[] | null | undefined,
) {
	const normalizedPaths = (sourceAudioFallbackPaths ?? [])
		.filter((audioPath) => typeof audioPath === "string" && audioPath.trim().length > 0)
		.map((audioPath) => ({
			audioPath,
			normalizedPath: normalizeSourceAudioFallbackPath(audioPath),
		}));
	const localVideoSourcePath = videoResource
		? normalizeSourceAudioFallbackPath(videoResource)
		: null;
	const hasEmbeddedSourceAudio =
		Boolean(localVideoSourcePath) &&
		normalizedPaths.some(({ normalizedPath }) => normalizedPath === localVideoSourcePath);

	return {
		hasEmbeddedSourceAudio,
		externalAudioPaths: hasEmbeddedSourceAudio
			? normalizedPaths
					.filter(({ normalizedPath }) => normalizedPath !== localVideoSourcePath)
					.map(({ audioPath }) => audioPath)
			: normalizedPaths.map(({ audioPath }) => audioPath),
	};
}
