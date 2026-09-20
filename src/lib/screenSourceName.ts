/**
 * 录制源显示名的本地化。
 *
 * 主进程给屏幕源起名是硬编码英文（electron/ipc/register/sources.ts）：
 *   `Screen 1` / `Screen 1 (Primary)` —— 中文用户在源列表里看到的是英文。
 * 窗口源的名字是 OS 实时窗口标题，不能也不该翻译；只有**我们生成的**
 * 屏幕源名需要本地化。
 *
 * 这里不去做法是改主进程：主进程不知道当前语言，改存储的源名还会破坏
 * 「已选源」的匹配（selectedSource 用原始 name 比对）。所以在渲染层
 * 只改**显示**，不改标识。
 */

const SCREEN_NAME_PATTERN = /^Screen (\d+)( \(Primary\))?$/;

export type TranslateFn = (
	key: string,
	fallback?: string,
	vars?: Record<string, string | number>,
) => string;

/**
 * 把屏幕源原始名翻译成当前语言的显示名。
 * 非 Screen 模式（窗口标题、未来其它命名）原样返回。
 */
export function localizeScreenSourceName(raw: string, t: TranslateFn): string {
	const match = SCREEN_NAME_PATTERN.exec(raw);
	if (!match) return raw;
	const n = Number(match[1]);
	const base = t("recording.screenSourceName", "Screen {{n}}", { n });
	return match[2] ? `${base} ${t("recording.screenSourcePrimary", "(Primary)")}` : base;
}
