export const THEME_KEY = "tv.theme";
export const THEME_ACCENTS_KEY = "tv.theme.accents";
export const HIGH_CONTRAST_KEY = "tv.highContrast";

export const THEMES = ["light", "dark"] as const;
export type ThemeId = (typeof THEMES)[number];

export const ACCENT_OPTIONS = [
  { id: "default", label: "Default", light: "#1d1d1f", dark: "#ffffff" },
  { id: "blue", label: "Blue", light: "#007aff", dark: "#007aff" },
  { id: "red", label: "Red", light: "#ff3b30", dark: "#ff453a" },
  { id: "yellow", label: "Yellow", light: "#ffcc00", dark: "#ffd600" },
  { id: "green", label: "Green", light: "#248a3d", dark: "#30d158" },
  { id: "orange", label: "Orange", light: "#ff8d28", dark: "#ff9230" },
  { id: "purple", label: "Purple", light: "#8944ab", dark: "#bf5af2" },
] as const;

export type AccentId = (typeof ACCENT_OPTIONS)[number]["id"];
export type ThemeAccents = Record<ThemeId, AccentId>;
export type ThemePreview = { bg: string; sidebar: string; text: string; muted: string; accent: string };

export const DEFAULT_THEME_ACCENTS: ThemeAccents = { light: "default", dark: "default" };

export const THEME_OPTIONS: { id: ThemeId; label: string; preview: ThemePreview }[] = [
  {
    id: "light",
    label: "Light",
    preview: { bg: "#f5f5f7", sidebar: "#ececee", text: "#1d1d1f", muted: "#d4d4d8", accent: "#007aff" },
  },
  {
    id: "dark",
    label: "Dark",
    preview: { bg: "#111111", sidebar: "#1d1d1f", text: "#ececec", muted: "#2c2c2e", accent: "#007aff" },
  },
];

export const MARKETING_PATHS = ["/", "/login", "/privacy", "/terms"] as const;

export function isMarketingPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return (MARKETING_PATHS as readonly string[]).includes(path);
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

export function isAccentId(value: unknown): value is AccentId {
  return typeof value === "string" && ACCENT_OPTIONS.some((option) => option.id === value);
}

export function parseThemeAccents(value: unknown): ThemeAccents {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    light: isAccentId(record.light) ? record.light : "default",
    dark: isAccentId(record.dark) ? record.dark : "default",
  };
}

export function accentColor(theme: ThemeId, accent: AccentId): string {
  const option = ACCENT_OPTIONS.find((item) => item.id === accent) ?? ACCENT_OPTIONS[0];
  return option[theme];
}

export function readStoredTheme(): ThemeId {
  if (typeof window === "undefined") return "dark";
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    if (isThemeId(raw)) return raw;
    if (raw === "coffee") return "light";
    if (raw === "razer" || raw === "crimson" || raw === "contrast") return "dark";
    return "dark";
  } catch {
    return "dark";
  }
}

export function readStoredThemeAccents(): ThemeAccents {
  if (typeof window === "undefined") return { ...DEFAULT_THEME_ACCENTS };
  try {
    const raw = window.localStorage.getItem(THEME_ACCENTS_KEY);
    return parseThemeAccents(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_THEME_ACCENTS };
  }
}

export function hasStoredThemeAccents(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(THEME_ACCENTS_KEY) !== null;
  } catch {
    return false;
  }
}

export function readStoredHighContrast(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(HIGH_CONTRAST_KEY) === "1";
  } catch {
    return false;
  }
}

export function hasStoredHighContrast(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(HIGH_CONTRAST_KEY) !== null;
  } catch {
    return false;
  }
}

export function persistThemeAccents(accents: ThemeAccents): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_ACCENTS_KEY, JSON.stringify(accents));
  } catch {
    // Keep the current in-memory preference when storage is unavailable.
  }
}

export function applyThemeAccent(theme: ThemeId, accent: AccentId, highContrast: boolean): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const color = accentColor(theme, accent);
  root.style.setProperty("--accent", color);
  root.style.setProperty("--pick", color);
  root.style.setProperty("--list-marker", accent === "default" ? "var(--text-muted)" : color);
  root.classList.toggle("high-contrast", theme === "dark" && highContrast);
}

export const THEME_SURFACE: Record<ThemeId, string> = {
  light: "#ececee",
  dark: "#1d1d1f",
};

export function applyThemeChrome(theme: ThemeId, marketing = false): void {
  if (typeof document === "undefined") return;
  const color = marketing ? "#111111" : THEME_SURFACE[theme];
  let themeMeta = document.querySelector('meta[name="theme-color"]');
  if (!themeMeta) {
    themeMeta = document.createElement("meta");
    themeMeta.setAttribute("name", "theme-color");
    document.head.appendChild(themeMeta);
  }
  themeMeta.setAttribute("content", color);

  let barMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (!barMeta) {
    barMeta = document.createElement("meta");
    barMeta.setAttribute("name", "apple-mobile-web-app-status-bar-style");
    document.head.appendChild(barMeta);
  }
  barMeta.setAttribute("content", !marketing && theme === "light" ? "default" : "black");
}

export function applyThemeClass(theme: ThemeId): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.add("theme-switching");
  root.classList.remove(...THEMES, "coffee", "razer", "crimson", "contrast", "high-contrast", "marketing");
  root.classList.add(theme);
  root.dataset.theme = theme;
  applyThemeChrome(theme, false);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.remove("theme-switching"));
  });
}

export function applyMarketingDark(): void {
  applyThemeClass("dark");
  if (typeof document === "undefined") return;
  document.documentElement.classList.add("marketing");
  applyThemeChrome("dark", true);
}

export function applyMarketingLight(): void {
  applyThemeClass("light");
  if (typeof document === "undefined") return;
  document.documentElement.classList.add("marketing");
  applyThemeChrome("light", true);
}

export function persistTheme(theme: ThemeId): void {
  applyThemeClass(theme);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // The visual theme still applies when storage is unavailable or blocked.
  }
}
