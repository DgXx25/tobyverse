"use client";

import { useEffect } from "react";
import { applyMarketingLight, applyThemeClass, readStoredTheme } from "@/lib/workspace/theme";

export function ForceMarketingDark() {
  useEffect(() => {
    applyMarketingLight();
    return () => applyThemeClass(readStoredTheme());
  }, []);

  return null;
}
