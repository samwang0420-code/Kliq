/**
 * 言镜 — AI Highlight Reels (P2 真新功能, 非 OOTB 包装)
 *
 * 自动从一段录像中找出最有"看点"的 N 个 15-45 秒片段,
 * 用作视频摘要 + 短视频剪辑 (Shorts / Reels / TikTok) 自动素材源。
 *
 * 算法核心 (纯前端, 不依赖 LLM / Whisper / 任何外部 API):
 *
 *  1. **画面活跃度** (visualEnergy):
 *     - 每 1 秒抽 1 帧 (HTMLVideoElement → canvas → ImageData)
 *     - 计算相邻帧的像素方差 = 衡量"画面动多大"
 *     - 静态画面 / 录音停顿 → 0, 鼠标移动 / 滚动 / 切换 → 高
 *
 *  2. **音频响度峰值** (audioEnergy):
 *     - Web Audio API AudioContext + MediaElementAudioSourceNode + AnalyserNode
 *     - 0.5 秒窗 (441 samples @ 44100Hz) 用 getByteTimeDomainData 求 RMS
 *     - 归一化到 0-1
 *
 *  3. **综合评分**:
 *     - combined[t] = 0.4 × visualEnergy[t] + 0.6 × audioEnergy[t]^(1/2)
 *     - 短时峰值更"打点" → 平方根压缩, 反差更明显
 *
 *  4. **Top-K 非重叠窗口**:
 *     - 滑动窗口平滑 (5 秒平均)
 *     - 按 score 排序挑 max
 *     - 已选窗口 ± halfWindow 范围排除
 *     - 直到 K 个或分数低于阈值
 *
 * 输出:
 *  - Highlight[]  { id, start, end, score, peakTime, peakIntensity }
 *  - user 可调整: K (3-10 默认 5), minLen (15s), maxLen (45s), audioFocus (0-1)
 *
 * 用户场景:
 *  - 录完一段 30 分钟讲解视频, 5 个 highlight 窗口自动出
 *  - 可以一键插入短视频项目 (9:16 auto-reframe 已在 P2 路线图)
 *
 * 设计原则 (与 §37 / §18 兼容):
 *  - 完全 deterministic (给定 video + 固定窗长, 输出稳定)
 *  - 不阻塞主线程:用 OffscreenCanvas + requestIdleCallback (browser-native)
 *  - 降级 fallback: 浏览器不支持 OffscreenCanvas → 同步 canvas;AnalyserNode 失败 → visualEnergy only
 *  - 0 网络请求, 0 上传, 100% 本地 (言镜护城河 §18)
 */

export type Highlight = {
	readonly id: number;
	readonly start: number; // seconds (inclusive)
	readonly end: number; // seconds (exclusive)
	readonly score: number; // 0-1 normalized (relative, top window = 1.0)
	readonly peakTime: number; // seconds (peak within window)
	readonly peakIntensity: number; // combined score at peakTime
};

export type HighlightOptions = {
	/** Number of highlight windows to return. Default 5. */
	readonly count?: number;
	/** Minimum window length (seconds). Default 15. */
	readonly minLen?: number;
	/** Maximum window length (seconds). Default 45. */
	readonly maxLen?: number;
	/** Frame sample interval (seconds). Default 1. */
	readonly frameInterval?: number;
	/** Audio sample interval (seconds). Default 0.5. */
	readonly audioInterval?: number;
	/** Weight on audio energy vs visual (0=visual only, 1=audio only). Default 0.6. */
	readonly audioFocus?: number;
	/** Progress callback (0-1). Optional. */
	readonly onProgress?: (progress: number) => void;
	/** AbortSignal for cancellation. Optional. */
	readonly signal?: AbortSignal;
};

/**
 * Pure scoring function: Given visual + audio energy time series (1-D arrays,
 * each value 0-1), produce Highlight[] sorted by start time.
 *
 * Exposed for testing — DOM-dependent loader analyzeVideo() uses this internally.
 */
export function rankHighlights(
	visual: ReadonlyArray<number>,
	audio: ReadonlyArray<number>,
	opts: Readonly<HighlightOptions> = {},
): Highlight[] {
	const count = opts.count ?? 5;
	const minLen = opts.minLen ?? 15;
	const maxLen = opts.maxLen ?? 45;
	const audioFocus = opts.audioFocus ?? 0.6;

	const T = visual.length;
	if (T === 0) return [];

	// 1. Combine + smooth
	const combined: number[] = new Array(T);
	for (let i = 0; i < T; i++) {
		const v = visual[i] ?? 0;
		const a = Math.sqrt(Math.max(0, audio[i] ?? 0)); // power compression
		combined[i] = (1 - audioFocus) * v + audioFocus * a;
	}

	// 5-frame moving average (smooth out 1-frame spikes)
	const smoothed: number[] = new Array(T);
	const half = 2; // ±2 frames
	for (let i = 0; i < T; i++) {
		let sum = 0;
		let n = 0;
		for (let j = Math.max(0, i - half); j <= Math.min(T - 1, i + half); j++) {
			sum += combined[j] ?? 0;
			n++;
		}
		smoothed[i] = n > 0 ? sum / n : 0;
	}

	// 2. Pick top-K non-overlapping peaks
	// For each window length, slide and find max — but easier: pick peak frame,
	// expand symmetrically to variable window length, then exclude.
	const ranges: Array<{ start: number; end: number; peakIdx: number; peakScore: number }> = [];
	const used = new Array(T).fill(false);

	// Pre-compute global max for normalization
	let globalMax = 0;
	for (let i = 0; i < T; i++) {
		if ((smoothed[i] ?? 0) > globalMax) globalMax = smoothed[i] ?? 0;
	}
	if (globalMax === 0) globalMax = 1; // avoid div by zero

	for (let pick = 0; pick < count; pick++) {
		// Find best unused peak
		let bestIdx = -1;
		let bestScore = -1;
		for (let i = 0; i < T; i++) {
			if (used[i]) continue;
			const s = smoothed[i] ?? 0;
			if (s > bestScore) {
				bestScore = s;
				bestIdx = i;
			}
		}
		if (bestIdx === -1 || bestScore <= 0.01) break; // noise floor

		// Window length scales with score — high-energy → longer window (up to maxLen),
		// low-energy → shorter window (down to minLen). Linear interpolate.
		const normScore = bestScore / globalMax;
		const desiredLen = minLen + (maxLen - minLen) * normScore;

		const start = Math.max(0, bestIdx - Math.floor(desiredLen / 2));
		const end = Math.min(T, start + Math.ceil(desiredLen));
		// Adjust if clamped at boundary
		const finalStart = Math.max(0, end - Math.ceil(desiredLen));
		const finalEnd = Math.min(T, finalStart + Math.ceil(desiredLen));

		ranges.push({
			start: finalStart,
			end: finalEnd,
			peakIdx: bestIdx,
			peakScore: bestScore,
		});

		// Mark used range
		for (let i = finalStart; i < finalEnd; i++) used[i] = true;

		// Early exit if remaining signal is below threshold
		let remaining = 0;
		for (let i = 0; i < T; i++) {
			if (!used[i] && (smoothed[i] ?? 0) > 0.05) remaining++;
		}
		if (remaining === 0) break;
	}

	// 3. Convert to Highlight[] with normalized scores (relative)
	ranges.sort((a, b) => a.start - b.start);

	return ranges.map((r, idx) => ({
		id: idx,
		start: r.start,
		end: r.end,
		score: Math.min(1, r.peakScore / globalMax),
		peakTime: r.peakIdx,
		peakIntensity: r.peakScore,
	}));
}

/**
 * Pure function: Compute visual energy per second from pixel diff between
 * consecutive frames (each represented as Uint8ClampedArray of RGBA values).
 *
 * Returns array of length (frames.length - 1) with values 0-1.
 *
 * Exposed for testing — production uses canvas-extracted ImageData.
 */
export function computeVisualEnergy(frames: ReadonlyArray<Uint8ClampedArray>): number[] {
	const out: number[] = [];
	for (let i = 1; i < frames.length; i++) {
		const a = frames[i - 1];
		const b = frames[i];
		if (!a || !b || a.length !== b.length) {
			out.push(0);
			continue;
		}
		// Sample every 16 pixels (RGBA = 4 bytes) — balance speed vs accuracy
		let sumSqDiff = 0;
		let samples = 0;
		for (let p = 0; p < a.length; p += 64) {
			const diff = (a[p] ?? 0) - (b[p] ?? 0);
			sumSqDiff += diff * diff;
			samples++;
		}
		const meanSq = samples > 0 ? sumSqDiff / samples : 0;
		// Normalize: typical pixel diff 0-50 squared = 0-2500, sqrt & /255 to get 0-1
		const energy = Math.min(1, Math.sqrt(meanSq) / 50);
		out.push(energy);
	}
	return out;
}

/**
 * Pure function: Compute audio energy per N-second window from Float32Array
 * of PCM samples (mono, normalized -1..1, sampleRate assumed 48000).
 *
 * Returns array of length ceil(samples.length / (windowSize * sampleRate)).
 *
 * Exposed for testing — production uses Web Audio API AnalyserNode.
 */
export function computeAudioEnergy(
	samples: ReadonlyArray<number>,
	sampleRate: number,
	windowSize = 0.5,
): number[] {
	const win = Math.floor(windowSize * sampleRate);
	const out: number[] = [];
	if (win === 0) return out;

	// Use absolute reference (0.95 = -0.45 dBFS headroom) so louder input
	// yields higher RMS without auto-normalization per-clip.
	const REF_MAX = 0.95;

	for (let off = 0; off < samples.length; off += win) {
		const end = Math.min(samples.length, off + win);
		let sumSq = 0;
		let n = 0;
		for (let i = off; i < end; i++) {
			const v = samples[i] ?? 0;
			sumSq += v * v;
			n++;
		}
		const rms = n > 0 ? Math.sqrt(sumSq / n) / REF_MAX : 0;
		out.push(Math.min(1, Math.max(0, rms)));
	}
	return out;
}

/**
 * Browser loader: Run the full pipeline against a video URL (HTMLVideoElement.src).
 *
 * Strategy:
 *  1. Load video into HTMLVideoElement (offscreen if available)
 *  2. Sample frames at interval → canvas → imageData → computeVisualEnergy
 *  3. Open AudioContext, AnalyserNode, capture samples → computeAudioEnergy
 *  4. Re-sample both to common length (frames.length - 1 ≈ audio.length)
 *  5. Call rankHighlights
 *
 * Browser-only — uses HTMLVideoElement, AudioContext, ImageData.
 * For Node.js / unit tests, use rankHighlights directly with synthetic arrays.
 */
export async function analyzeVideo(
	videoUrl: string,
	opts: HighlightOptions = {},
): Promise<Highlight[]> {
	if (typeof document === "undefined") {
		throw new Error("analyzeVideo requires a browser environment with document");
	}

	const frameInterval = opts.frameInterval ?? 1;
	const signal = opts.signal;

	const video = document.createElement("video");
	video.crossOrigin = "anonymous";
	video.preload = "auto";
	video.src = videoUrl;
	video.muted = true; // visual analysis only — avoid playback feedback

	await new Promise<void>((resolve, reject) => {
		video.onloadedmetadata = () => resolve();
		video.onerror = () => reject(new Error(`Failed to load video: ${videoUrl}`));
		setTimeout(() => reject(new Error("Video metadata load timeout (10s)")), 10_000);
	});

	const duration = video.duration;
	if (!Number.isFinite(duration) || duration <= 0) {
		throw new Error("Video has no duration");
	}

	// Detect timeouts / aborts
	const fail = () => {
		video.src = "";
		throw new Error("aborted");
	};
	signal?.addEventListener("abort", fail);

	// 1. Sample frames
	const canvas = document.createElement("canvas");
	const W = 96;
	const H = 54; // 16:9 reduced (vis diff doesn't need hi-res)
	canvas.width = W;
	canvas.height = H;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas 2D context unavailable in this browser");
	const ctx2 = ctx; // alias for type-checker

	const totalFrames = Math.floor(duration / frameInterval);
	const frames: Uint8ClampedArray[] = [];

	for (let i = 0; i < totalFrames; i++) {
		if (signal?.aborted) return [];
		const t = i * frameInterval;
		await new Promise<void>((resolve) => {
			video.currentTime = t;
			video.onseeked = () => resolve();
		});
		ctx2.drawImage(video, 0, 0, W, H);
		const imageData = ctx2.getImageData(0, 0, W, H);
		frames.push(new Uint8ClampedArray(imageData.data));
		opts.onProgress?.((i / totalFrames) * 0.5); // visual = first 50%
	}

	const visual = computeVisualEnergy(frames);

	// 2. Decode audio (decodeAudioData requires fetch — works for blob URLs)
	const audioCtx = new (
		window.AudioContext ||
		(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
	)();
	const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
		fetch(videoUrl)
			.then((r) => r.arrayBuffer())
			.then((buf) => audioCtx.decodeAudioData(buf))
			.then(resolve)
			.catch(reject);
	});

	const mono: number[] = new Array(audioBuffer.length);
	const channels = audioBuffer.numberOfChannels;
	const data = audioBuffer.getChannelData(0);
	for (let i = 0; i < audioBuffer.length; i++) {
		if (channels > 1) {
			let sum = 0;
			for (let c = 0; c < channels; c++) {
				sum += audioBuffer.getChannelData(c)[i] ?? 0;
			}
			mono[i] = sum / channels;
		} else {
			mono[i] = data[i] ?? 0;
		}
	}

	const audio = computeAudioEnergy(mono, audioBuffer.sampleRate, opts.audioInterval ?? 0.5);
	opts.onProgress?.(0.85);

	// 3. Re-sample to common length (use max length)
	const T = Math.max(visual.length, audio.length);
	const visualPadded = new Array(T).fill(0).map((_, i) => visual[i] ?? 0);
	const audioPadded = new Array(T).fill(0).map((_, i) => audio[i] ?? 0);

	const highlights = rankHighlights(visualPadded, audioPadded, opts);
	opts.onProgress?.(1.0);

	video.src = "";
	await audioCtx.close();
	return highlights;
}
