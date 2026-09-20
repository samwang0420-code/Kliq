import { useI18n } from "@/contexts/I18nContext";
import { closeAccountCenter, useProGate } from "@/lib/proGate";
import { AccountCenterPanel, featureLabel } from "./AccountCenterPanel";

/**
 * 个人中心宿主：挂在编辑器里，把闸门状态（proGate store）接到面板上。
 *
 * 打开来源有两类：
 *   1. 用户主动点「Pro / 账号」入口（AIToolbar 头部）
 *   2. Pro 功能被闸门拦截（useAIActions 抛 ProRequiredError）→ 自动弹出并标注
 */
export function AccountCenterHost() {
	const { centerOpen, blockedFeature } = useProGate();
	const { t } = useI18n();

	return (
		<AccountCenterPanel
			open={centerOpen}
			blockedFeatureLabel={featureLabel(t, blockedFeature)}
			onClose={closeAccountCenter}
		/>
	);
}

export default AccountCenterHost;
