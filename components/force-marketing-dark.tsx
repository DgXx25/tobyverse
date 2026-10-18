"use client";

import { useEffect } from "react";
import { applyMarketingDark, applyThemeClass, readStoredTheme } from "@/lib/workspace/theme";

export function ForceMarketingDark() {
  useEffect(() => {
    applyMarketingDark();
    return () => applyThemeClass(readStoredTheme());
  }, []);

  return null;
}
