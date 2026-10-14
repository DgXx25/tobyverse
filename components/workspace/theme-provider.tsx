"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { lockMobileZoom, markIosStandalone } from "@/lib/mobile-zoom";
import { subscribeUserProfile, updateUserAppearance, updateUserTheme } from "@/lib/account/store";
import {
  applyThemeAccent,
  applyMarketingDark,
  applyThemeClass,
  hasStoredHighContrast,
  hasStoredThemeAccents,
  isAccentId,
  isMarketingPath,
  isThemeId,
  parseThemeAccents,
  persistThemeAccents,
  persistTheme,
  readStoredHighContrast,
  readStoredTheme,
  type AccentId,
  type ThemeAccents,
  type ThemeId,
} from "@/lib/workspace/theme";

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  themeAccents: ThemeAccents;
  setThemeAccent: (accent: AccentId) => void;
  highContrast: boolean;
  setHighContrast: (value: boolean) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.uid;
  const pathname = usePathname();
  const [theme, setThemeState] = useState<ThemeId>("dark");
  const [themeAccents, setThemeAccentsState] = useState<ThemeAccents>({ light: "default", dark: "default" });
  const [highContrast, setHighContrastState] = useState(false);
  const themeRef = useRef<ThemeId>("dark");
  const themeAccentsRef = useRef<ThemeAccents>({ light: "default", dark: "default" });
  const highContrastRef = useRef(false);
  const pendingThemeRef = useRef<{ userId: string; theme: ThemeId } | null>(null);
  const pendingAppearanceRef = useRef<{ userId: string; themeAccents: ThemeAccents; highContrast: boolean } | null>(null);

  useLayoutEffect(() => {
    const next = readStoredTheme();
    themeRef.current = next;
    setThemeState(next);
    const accents = { light: "default" as const, dark: "default" as const };
    themeAccentsRef.current = accents;
    setThemeAccentsState(accents);
    persistThemeAccents(accents);
    const contrast = readStoredHighContrast();
    highContrastRef.current = contrast;
    setHighContrastState(contrast);
  }, []);

  // The root provider survives navigation from the landing page into chat.
  useLayoutEffect(() => {
    if (isMarketingPath(pathname)) {
      applyMarketingDark();
      applyThemeAccent("dark", "blue", false);
    } else {
      applyThemeClass(themeRef.current);
      applyThemeAccent(theme, "default", highContrast);
    }
  }, [pathname, theme, themeAccents, highContrast]);

  useEffect(() => {
    markIosStandalone();
    return lockMobileZoom();
  }, []);

  useEffect(() => {
    pendingThemeRef.current = null;
    if (!userId) return;
    return subscribeUserProfile(userId, (profile) => {
      if (!profile) return;
      const remote = profile.theme;
      const pending = pendingThemeRef.current;
      if (pending?.userId === userId) {
        if (remote !== pending.theme) return;
        pendingThemeRef.current = null;
      }
      if (!isThemeId(remote)) return;
      if (remote !== themeRef.current) {
        themeRef.current = remote;
        setThemeState(remote);
        if (!isMarketingPath(window.location.pathname)) persistTheme(remote);
      }

      const storedRemoteAccents = parseThemeAccents(profile.themeAccents);
      const remoteSelectedAccent = storedRemoteAccents[themeRef.current];
      const remoteAccents = { light: remoteSelectedAccent, dark: remoteSelectedAccent };
      const localAccents = themeAccentsRef.current;
      const hasLocalAccents = hasStoredThemeAccents();
      const remoteContrast = profile.highContrast === true;
      const localContrast = highContrastRef.current;
      const hasLocalContrast = hasStoredHighContrast();
      const pendingAppearance = pendingAppearanceRef.current;
      if (pendingAppearance?.userId === userId) {
        if (pendingAppearance.highContrast !== remoteContrast || pendingAppearance.themeAccents.light !== remoteAccents.light || pendingAppearance.themeAccents.dark !== remoteAccents.dark) return;
        pendingAppearanceRef.current = null;
      }
      if (hasLocalAccents && (localAccents.light !== remoteAccents.light || localAccents.dark !== remoteAccents.dark)) {
        void updateUserAppearance(userId, { themeAccents: localAccents });
      } else if (!hasLocalAccents && (remoteAccents.light !== localAccents.light || remoteAccents.dark !== localAccents.dark)) {
        themeAccentsRef.current = remoteAccents;
        setThemeAccentsState(remoteAccents);
        persistThemeAccents(remoteAccents);
      }
      if (hasLocalContrast && localContrast !== remoteContrast) {
        void updateUserAppearance(userId, { highContrast: localContrast });
      } else if (!hasLocalContrast && remoteContrast !== localContrast) {
        highContrastRef.current = remoteContrast;
        setHighContrastState(remoteContrast);
        try { window.localStorage.setItem("tv.highContrast", remoteContrast ? "1" : "0"); } catch { /* Keep in-memory state. */ }
      }
    });
  }, [userId]);

  const setTheme = useCallback(
    (next: ThemeId) => {
      if (next === themeRef.current) return;
      if (userId) pendingThemeRef.current = { userId, theme: next };
      themeRef.current = next;
      setThemeState(next);
      persistTheme(next);
      if (userId) void updateUserTheme(userId, next);
    },
    [userId],
  );

  const setThemeAccent = useCallback((accent: AccentId) => {
    if (!isAccentId(accent)) return;
    const next = { light: accent, dark: accent };
    themeAccentsRef.current = next;
    setThemeAccentsState(next);
    persistThemeAccents(next);
    if (userId) {
      pendingAppearanceRef.current = { userId, themeAccents: next, highContrast: highContrastRef.current };
      void updateUserAppearance(userId, { themeAccents: next });
    }
  }, [userId]);

  const setHighContrast = useCallback((next: boolean) => {
    highContrastRef.current = next;
    setHighContrastState(next);
    try { window.localStorage.setItem("tv.highContrast", next ? "1" : "0"); } catch { /* Keep in-memory state. */ }
    if (userId) {
      pendingAppearanceRef.current = { userId, themeAccents: themeAccentsRef.current, highContrast: next };
      void updateUserAppearance(userId, { highContrast: next });
    }
  }, [userId]);

  const value = useMemo(() => ({ theme, setTheme, themeAccents, setThemeAccent, highContrast, setHighContrast }), [theme, setTheme, themeAccents, setThemeAccent, highContrast, setHighContrast]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider.");
  return value;
}
