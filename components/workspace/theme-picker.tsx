"use client";

import { THEME_OPTIONS, accentColor, type ThemePreview } from "@/lib/workspace/theme";
import { useTheme } from "@/components/workspace/theme-provider";
import { UiIcon } from "@/components/workspace/ui-icon";

export function ThemePicker() {
  const { theme, setTheme, highContrast, setHighContrast } = useTheme();

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap gap-3">
          {THEME_OPTIONS.map((option) => (
            <ThemeCard
              key={option.id}
              label={option.label}
              preview={{ ...option.preview, accent: accentColor(option.id, "default") }}
              selected={theme === option.id}
              onSelect={() => setTheme(option.id)}
            />
          ))}
        </div>
      </div>

      {theme === "dark" ? (
        <div className="flex min-h-10 items-center justify-between gap-4 rounded-xl px-2 text-[13px] text-foreground">
          <span>High contrast</span>
          <button
            type="button"
            role="switch"
            aria-label="High contrast"
            aria-checked={highContrast}
            onClick={() => setHighContrast(!highContrast)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${highContrast ? "border-transparent bg-[var(--accent)]" : "border-border bg-surface-2"}`}
          >
            <span className={`h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${highContrast ? "translate-x-[21px]" : "translate-x-[3px]"}`} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ThemeCard({
  label,
  preview,
  selected,
  onSelect,
}: {
  label: string;
  preview: ThemePreview;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} className="w-[128px] text-center">
      <div
        className={`overflow-hidden rounded-xl border p-1 ${selected ? "border-foreground" : "border-transparent hover:border-border"}`}
      >
        <div className="flex h-[78px] overflow-hidden rounded-lg border border-black/10" style={{ background: preview.bg }}>
          <div className="w-[30%] shrink-0" style={{ background: preview.sidebar }} />
          <div className="flex flex-1 flex-col gap-1.5 p-2.5">
            <div className="h-1.5 w-9 rounded-full" style={{ background: preview.text, opacity: 0.9 }} />
            <div className="h-1 w-full rounded-full" style={{ background: preview.muted }} />
            <div className="h-1 w-[72%] rounded-full" style={{ background: preview.accent }} />
            <div className="mt-auto h-4 w-full rounded" style={{ background: preview.sidebar }} />
          </div>
        </div>
      </div>
      <span className={`mt-2.5 block text-[13px] ${selected ? "text-foreground" : "text-muted"}`}>{label}</span>
    </button>
  );
}
