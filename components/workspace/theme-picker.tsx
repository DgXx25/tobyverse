"use client";

import { THEME_OPTIONS, type ThemeId } from "@/lib/workspace/theme";
import { useTheme } from "@/components/workspace/theme-provider";
import { UiIcon, type UiIconName } from "@/components/workspace/ui-icon";

const THEME_ICON: Record<ThemeId, UiIconName> = {
  light: "sun",
  dark: "moon",
};

export function ThemePicker() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-0.5">
      {THEME_OPTIONS.map((option) => {
        const selected = theme === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-label={option.label}
            aria-pressed={selected}
            onClick={() => setTheme(option.id)}
            className={`flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors ${
              selected ? "bg-foreground/10 text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            <UiIcon name={THEME_ICON[option.id]} size={18} />
          </button>
        );
      })}
    </div>
  );
}
