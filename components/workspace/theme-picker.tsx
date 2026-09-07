"use client";

import { THEME_OPTIONS, type ThemePreview } from "@/lib/workspace/theme";
import { useTheme } from "@/components/workspace/theme-provider";

export function ThemePicker() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex flex-wrap gap-4">
      {THEME_OPTIONS.map((option) => (
        <ThemeCard
          key={option.id}
          label={option.label}
          preview={option.preview}
          selected={theme === option.id}
          onSelect={() => setTheme(option.id)}
        />
      ))}
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
        className={`overflow-hidden rounded-xl border p-1 ${
          selected ? "border-foreground" : "border-transparent hover:border-border"
        }`}
      >
        <div className="flex h-[78px] overflow-hidden rounded-lg border border-black/10" style={{ background: preview.bg }}>
          <div className="w-[30%] shrink-0" style={{ background: preview.sidebar }} />
          <div className="flex flex-1 flex-col gap-1.5 p-2.5">
            <div className="h-1.5 w-9 rounded-full" style={{ background: preview.text, opacity: 0.9 }} />
            <div className="h-1 w-full rounded-full" style={{ background: preview.muted }} />
            <div className="h-1 w-[72%] rounded-full" style={{ background: preview.muted }} />
            <div className="mt-auto h-4 w-full rounded" style={{ background: preview.sidebar }} />
          </div>
        </div>
      </div>
      <span className={`mt-2.5 block text-[13px] ${selected ? "text-foreground" : "text-muted"}`}>{label}</span>
    </button>
  );
}
