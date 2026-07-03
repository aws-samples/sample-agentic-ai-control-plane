"use client";

import { useTranslations } from "next-intl";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { MENU_SECTIONS, type Model, type Persona, type SectionId } from "./constants";
import { ModelsSection, PersonasSection } from "./sections";

interface PlatformSettingsProps {
  models: Model[];
  onModelsChanged: (models: Model[]) => void;
  personas: Persona[];
  onPersonasChanged: (personas: Persona[]) => void;
}

export function PlatformSettings({
  models,
  onModelsChanged,
  personas,
  onPersonasChanged,
}: PlatformSettingsProps) {
  const t = useTranslations("PlatformSettings");
  const [activeSection, setActiveSection] = useQueryState<SectionId>(
    "section",
    parseAsStringLiteral(["models", "personas"] as const)
      .withDefault("models")
      .withOptions({ history: "push" }),
  );

  return (
    <div className="flex-1 h-full overflow-hidden relative">
      <div className="flex h-full w-full flex-col">
        <div className="flex items-center border-b px-4 py-3">
          <div>
            <h1 className="text-sm font-semibold text-foreground">
              {t("header.title")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("header.subtitle")}
            </p>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-44 shrink-0 border p-2 ml-4 my-4 rounded-lg">
            <nav className="flex flex-col gap-0.5">
              {MENU_SECTIONS.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] leading-tight transition-colors ${
                      isActive
                        ? "bg-foreground/6 text-foreground"
                        : "text-foreground/70 hover:bg-foreground/4 hover:text-foreground/90"
                    }`}
                  >
                    <Icon className="size-3.5 shrink-0" />
                    {t(section.labelKey)}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto p-6 pt-4 space-y-4">
              {activeSection === "models" && (
                <ModelsSection
                  models={models}
                  onModelsChanged={onModelsChanged}
                />
              )}
              {activeSection === "personas" && (
                <PersonasSection
                  personas={personas}
                  onPersonasChanged={onPersonasChanged}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
