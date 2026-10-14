"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { UiIcon, resolveUiIconName } from "@/components/workspace/ui-icon";

const cache = new Map<string, IconSvgElement>();

async function loadGlyph(name: string): Promise<IconSvgElement | null> {
  const hit = cache.get(name);
  if (hit) return hit;
  const response = await fetch(`/api/icons?name=${encodeURIComponent(name)}`);
  if (!response.ok) return null;
  const icon = (await response.json()) as IconSvgElement | null;
  if (icon) cache.set(name, icon);
  return icon;
}

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
  const [icon, setIcon] = useState<IconSvgElement | null>(() => cache.get(name) ?? null);

  useEffect(() => {
    if (cache.has(name)) {
      setIcon(cache.get(name) ?? null);
      return;
    }
    let cancel = false;
    void loadGlyph(name).then((next) => {
      if (!cancel) setIcon(next);
    });
    return () => {
      cancel = true;
    };
  }, [name]);

  if (!icon) return <span className="inline-block shrink-0" style={{ width: size, height: size }} />;
  return <HugeiconsIcon icon={icon} size={size} color={color || "currentColor"} strokeWidth={1.75} className={className} aria-hidden="true" />;
}

export function iconSearchLabel(name: string): string {
  return name.replace(/Icon$/, "").replace(/(\d+)/g, " $1").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}
