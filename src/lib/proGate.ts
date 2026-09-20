/**
 * Kliq — 商业化闸门的 UI 通道（不依赖任何组件）
 *
 * 该模块解决一个具体问题：Pro 闸门在 `useAIActions` 里抛出，但**弹出升级面板**
 * 需要一个挂在编辑器里的宿主组件。两者不能直接互相 import（hook ↔ 组件循环），
 * 所以中间放一个极小的外部 store：
 *
 *   useAIActions（闸门命中）──requestProUpgrade(feature)──▶ store
 *   AccountCenterHost（始终挂在编辑器里）◀──useProGate()── store
 */

import { useSyncExternalStore } from "react";

export type ProGateState = {
	/** 个人中心抽屉是否展开 */
	centerOpen: boolean;
	/** 命中闸门的功能 id（用于在面板顶部显示“该功能需要 Pro”） */
	blockedFeature: string | null;
};

const INITIAL_STATE: ProGateState = {
	centerOpen: false,
	blockedFeature: null,
};

let state: ProGateState = INITIAL_STATE;
const listeners = new Set<() => void>();

function setState(next: Partial<ProGateState>): void {
	state = { ...state, ...next };
	for (const listener of listeners) {
		try {
			listener();
		} catch {
			// 单个订阅者异常不影响其它订阅者
		}
	}
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** 订阅闸门状态变化（测试与非 React 宿主使用；React 侧请用 useProGate） */
export const subscribeProGate = subscribe;

export function getProGateState(): ProGateState {
	return state;
}

/** 打开个人中心（可选携带被拦截的功能 id） */
export function openAccountCenter(blockedFeature?: string): void {
	setState({ centerOpen: true, blockedFeature: blockedFeature ?? null });
}

export function closeAccountCenter(): void {
	setState({ centerOpen: false, blockedFeature: null });
}

/** 闸门命中时调用：打开个人中心并标明被拦截的功能 */
export function requestProUpgrade(feature: string): void {
	openAccountCenter(feature);
}

export function useProGate(): ProGateState {
	return useSyncExternalStore(subscribe, getProGateState, () => INITIAL_STATE);
}
