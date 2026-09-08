"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  applyMarketingDark,
  applyThemeClass,
  isMarketingPath,
  persistTheme,
  readStoredTheme,
  THEME_KEY,
  type ThemeId,
} from "@/lib/workspace/theme";

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("dark");

  useEffect(() => {
    const stored = (() => {
      try {
        return window.localStorage.getItem(THEME_KEY);
      } catch {
        return null;
      }
    })();
    const next = readStoredTheme();
    setThemeState(next);
    if (isMarketingPath(window.location.pathname)) {
      applyMarketingDark();
      return;
    }
    if (stored && stored !== next) persistTheme(next);
    else applyThemeClass(next);
  }, []);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    persistTheme(next);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider.");
  return value;
}
