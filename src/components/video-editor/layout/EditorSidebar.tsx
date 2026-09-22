import {
	Camera,
	ClosedCaptioning,
	Cursor,
	Gear,
	PuzzlePiece,
	Sparkle,
	UserCircle,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import type { ComponentProps, Dispatch, SetStateAction } from "react";
import { useMemo } from "react";
import { openAccountCenter } from "@/lib/proGate";
import { useIsPro } from "@/hooks/useLicenseStatus";
import { cn } from "@/lib/utils";
import type { useI18n } from "@/contexts/I18nContext";
import ExtensionManager from "../ExtensionManager";
import { SettingsPanel } from "../SettingsPanel";
import type { EditorEffectSection } from "../types";

type Props = {
	t: ReturnType<typeof useI18n>["t"];
	activeSection: EditorEffectSection;
	setActiveSection: Dispatch<SetStateAction<EditorEffectSection>>;
	settingsPanelProps: ComponentProps<typeof SettingsPanel>;
};

export function EditorSidebar({ t, activeSection, setActiveSection, settingsPanelProps }: Props) {
	const isPro = useIsPro();
	const sections = useMemo(
		() => [
			{ id: "scene" as const, label: t("settings.sections.scene", "Scene"), icon: Sparkle },
			{ id: "cursor" as const, label: t("settings.sections.cursor", "Cursor"), icon: Cursor },
			{ id: "webcam" as const, label: t("settings.sections.webcam", "Webcam"), icon: Camera },
			{
				id: "captions" as const,
				label: t("settings.sections.captions", "Captions"),
				icon: ClosedCaptioning,
			},
			{
				id: "settings" as const,
				label: t("settings.sections.settings", "Settings"),
				icon: Gear,
			},
			{
				id: "extensions" as const,
				label: t("settings.sections.extensions", "Extensions"),
				icon: PuzzlePiece,
			},
		],
		[t],
	);
	return (
		<div className="flex flex-shrink-0 gap-1.5">
			<div className="flex flex-shrink-0 flex-col items-center gap-0.5 px-2 py-2">
				{sections.map((section) => {
					const isActive = activeSection === section.id;
					return (
						<div key={section.id} className="flex items-center">
							<motion.button
								type="button"
								onClick={() => setActiveSection(section.id)}
								title={section.label}
								className="group relative flex h-9 w-9 items-center justify-center rounded-lg outline-none focus:outline-none focus-visible:outline-none"
								animate={{ opacity: isActive ? 1 : 0.55 }}
								transition={{ duration: 0.14 }}
							>
								{isActive ? (
									<motion.span
										layoutId="rail-active-bg"
										className="absolute inset-0 rounded-lg bg-foreground/[0.08]"
										transition={{ type: "spring", stiffness: 450, damping: 35 }}
									/>
								) : null}
								<motion.span
									className="relative z-10"
									animate={{
										color: isActive ? "#2563EB" : "hsl(var(--foreground))",
									}}
									transition={{ duration: 0.14 }}
								>
									<section.icon
										className="h-[27px] w-[27px]"
										weight={isActive ? "fill" : "regular"}
									/>
								</motion.span>
							</motion.button>
							<div className="ml-1.5 h-1.5 w-1.5 flex-shrink-0">
								{isActive ? (
									<motion.span
										layoutId="rail-active-dot"
										className="block h-1.5 w-1.5 rounded-full bg-[#2563EB]"
										initial={{ opacity: 0, scale: 0.5 }}
										animate={{ opacity: 1, scale: 1 }}
										exit={{ opacity: 0, scale: 0.5 }}
										transition={{ type: "spring", stiffness: 500, damping: 32 }}
									/>
								) : null}
							</div>
						</div>
					);
				})}
				<div className="mt-auto flex flex-col items-center gap-0.5 pt-3">
					<motion.button
						type="button"
						onClick={() => openAccountCenter()}
						title={t("editor.account.title", "Account")}
						aria-label={t("editor.account.title", "Account")}
						data-testid="account-center-trigger"
						className="group relative flex h-9 w-9 items-center justify-center rounded-lg text-foreground/65 outline-none transition hover:text-foreground focus:outline-none focus-visible:outline-none"
						whileHover={{ opacity: 1 }}
						initial={{ opacity: 0.65 }}
					>
						<motion.span className="absolute inset-0 rounded-lg bg-foreground/[0.04] opacity-0 transition group-hover:opacity-100" />
						<UserCircle className="relative z-10 h-[22px] w-[22px]" />
						<span
							aria-hidden="true"
							className={cn(
								"absolute right-0.5 top-0.5 z-20 h-2 w-2 rounded-full",
								isPro ? "bg-[#22c55e] shadow-[0_0_4px_rgba(34,197,94,0.45)]" : "bg-foreground/15"
							)}
						/>
					</motion.button>
				</div>
			</div>
			{activeSection === "extensions" ? (
				<ExtensionManager />
			) : (
				<SettingsPanel {...settingsPanelProps} />
			)}
		</div>
	);
}
