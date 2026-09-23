import { ArrowSquareOut, Lightning } from "@phosphor-icons/react";
import { type ReactNode } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { AiServiceSection } from "../AiServiceSection";

export function AiTab(): ReactNode {
	const t = useScopedT("common");

	const handleOpenAIEnhance = () => {
		// 沿用既有导出菜单入口: 触发自定义事件, 由编辑器外壳监听
		if (typeof window !== "undefined") {
			window.dispatchEvent(new CustomEvent("kliq:open-ai-enhance"));
		}
	};

	return (
		<div className="space-y-6">
			<section className="space-y-3">
				<div className="flex items-center justify-between">
					<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						{t("yanjing.account.tabAi", "AI 服务")}
					</h3>
				</div>
				<AiServiceSection isProActive={false} />
			</section>

			<section className="rounded-lg border border-dashed border-border/60 px-4 py-3">
				<div className="flex items-start gap-2">
					<Lightning
						size={14}
						weight="duotone"
						className="mt-0.5 shrink-0 text-muted-foreground"
					/>
					<div className="flex-1">
						<p className="text-xs text-muted-foreground">
							{t(
								"yanjing.account.ai.unavailable",
								"当前环境无法读写本地设置：密钥只能保存在桌面端（Electron），浏览器预览里输入的配置不会保留。",
							)}
						</p>
						<button
							type="button"
							onClick={handleOpenAIEnhance}
							className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs transition-colors hover:bg-foreground/5"
						>
							{t("yanjing.account.openAIEnhance", "去 AI 增强")}
							<ArrowSquareOut size={11} />
						</button>
					</div>
				</div>
			</section>
		</div>
	);
}

export default AiTab;
