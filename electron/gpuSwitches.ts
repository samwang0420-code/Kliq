export interface GpuSwitches {
	useAngle?: string;
	disableFeatures?: string[];
}

export function getGpuSwitches(
	platform: NodeJS.Platform,
	_env: NodeJS.ProcessEnv = process.env,
): GpuSwitches {
	if (platform === "darwin") {
		return {
			useAngle: "metal",
			disableFeatures: ["MacCatapLoopbackAudioForScreenShare"],
		};
	}

	if (platform === "win32") {
		return { useAngle: "d3d11" };
	}

	if (platform === "linux") {
		// No use-gl override: Chromium only allows (gl=egl-angle, angle=default) on Linux now.
		// Passing use-gl=egl requests (gl=egl-gles2, angle=none) and kills the GPU process,
		// which is why AppImage builds crashed on Ubuntu 24.04+ / ZorinOS (issues #364/#137/#888).
		return {
			disableFeatures: ["VaapiVideoDecoder", "VaapiVideoEncoder"],
		};
	}

	return {};
}
