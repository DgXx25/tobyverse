"use client";

import { useEffect, useRef } from "react";
import type { AnimationInstance, GalaxyStatic } from "galaxyjs";

const LANDING_BG = "#0a0a0a";

function resolveGalaxy(mod: { default?: GalaxyStatic } | GalaxyStatic): GalaxyStatic {
  if (mod && "create" in mod && typeof mod.create === "function") return mod;
  return (mod as { default: GalaxyStatic }).default;
}

export function GalaxyWarp() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = stageRef.current;
    if (!host) return;

    let instance: AnimationInstance | null = null;
    let cancelled = false;

    void import("galaxyjs").then((mod) => {
      if (cancelled || !stageRef.current) return;
      try {
        instance = resolveGalaxy(mod).create("constellation", stageRef.current, {
          speed: 0.5,
          count: 150,
          colors: ["#ffffff", "#9bd0ff", "#c9b8ff"],
          background: LANDING_BG,
        });
      } catch {
        instance = null;
      }
      if (cancelled) {
        instance?.destroy();
        instance = null;
      }
    });

    return () => {
      cancelled = true;
      instance?.destroy();
    };
  }, []);

  return <div id="stage" ref={stageRef} className="galaxy-stage" aria-hidden />;
}
