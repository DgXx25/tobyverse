"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { UiIcon, resolveUiIconName } from "@/components/workspace/ui-icon";
import { createBatchedIconLoader } from "@/lib/workspace/icon-loader";

const glyphLoader = createBatchedIconLoader<IconSvgElement>(async (names) => {
  const response = await fetch(`/api/icons?names=${encodeURIComponent(names.join(","))}`);
  if (!response.ok) throw new Error("Could not load symbols.");
  return (await response.json()) as Record<string, IconSvgElement | null>;
});

export function ProjectSymbol({
  name,
  size = 18,
  className = "",
  color,
}: {
  name: string;
  size?: number;
  className?: string;
  color?: string;
}) {
  const known = resolveUiIconName(name);
  if (known) return <UiIcon name={known} size={size} className={className} color={color} />;
  return <PackGlyph name={name} size={size} className={className} color={color} />;
}

function PackGlyph({ name, size, className, color }: { name: string; size: number; className: string; color?: string }) {
  const [result, setResult] = useState<{ name: string; icon: IconSvgElement | null }>(() => ({ name: "", icon: null }));

  useEffect(() => {
    let cancel = false;
    // App startup doesn't depend on decorative custom notebook symbols.
    const timer = window.setTimeout(() => {
      void glyphLoader.load(name)
        .then((next) => {
          if (!cancel) setResult({ name, icon: next });
        })
        .catch(() => {
          if (!cancel) setResult({ name, icon: null });
        });
    }, 350);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [name]);

  if (result.name !== name) {
    return (
      <span className={`flex shrink-0 items-center justify-center ${className}`} style={{ width: size, height: size }} role="img" aria-label="Loading symbol">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border border-muted/40 border-t-foreground" />
      </span>
    );
  }
  if (!result.icon) return <span className="inline-block shrink-0" style={{ width: size, height: size }} />;
  return <HugeiconsIcon icon={result.icon} size={size} color={color || "currentColor"} strokeWidth={1.75} className={className} aria-hidden="true" />;
}

export function iconSearchLabel(name: string): string {
  return name.replace(/Icon$/, "").replace(/(\d+)/g, " $1").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}
