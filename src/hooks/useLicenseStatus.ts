/**
 * Kliq — 许可状态 React 绑定
 *
 * 为什么不用 useSyncExternalStore：`getLicenseStatus()` 每次读 localStorage 都会
 * 反序列化出一个**新对象**，直接作为 snapshot 会触发无限重渲染。因此这里沿用
 * 「初始读一次 + 订阅增量更新」的 useState 模式。
 */

import { useCallback, useEffect, useState } from "react";
import { getLicenseStatus, type LicenseStatus, subscribeLicense } from "@/lib/license";

/** 订阅本机许可状态（AI 工具栏 / 个人中心共用） */
export function useLicenseStatus(): LicenseStatus {
	const [status, setStatus] = useState<LicenseStatus>(() => getLicenseStatus());

	useEffect(() => subscribeLicense(setStatus), []);

	// 每次挂载时重新读一次：面板可能在不同的浏览器上下文/窗口中被打开
	const refresh = useCallback(() => setStatus(getLicenseStatus()), []);
	useEffect(() => {
		refresh();
	}, [refresh]);

	return status;
}

/** 是否已激活 Pro（买断制：activated && tier === "pro"） */
export function useIsPro(): boolean {
	const status = useLicenseStatus();
	return status.activated && status.tier === "pro";
}

export default useLicenseStatus;
