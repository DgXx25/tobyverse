export const THEME_KEY = "tv.theme";

export const THEMES = ["light", "dark", "razer", "crimson", "coffee"] as const;

export type ThemeId = (typeof THEMES)[number];

export type ThemePreview = {
  bg: string;
  sidebar: string;
  text: string;
  muted: string;
  accent: string;
};

export const THEME_OPTIONS: { id: ThemeId; label: string; preview: ThemePreview }[] = [
  {
    id: "light",
    label: "Light",
    preview: { bg: "#ffffff", sidebar: "#f4f4f5", text: "#18181b", muted: "#d4d4d8", accent: "#2563eb" },
  },
  {
    id: "dark",
    label: "Dark",
    preview: { bg: "#131211", sidebar: "#1c1b1a", text: "#ececec", muted: "#3a3837", accent: "#7eb6ff" },
  },
  {
    id: "razer",
    label: "Razer",
    preview: { bg: "#0a0a0a", sidebar: "#161616", text: "#ececec", muted: "#3a3a3a", accent: "#00ff00" },
  },
  {
    id: "crimson",
    label: "Crimson",
    preview: { bg: "#0a0a0a", sidebar: "#161616", text: "#ececec", muted: "#3a3a3a", accent: "#ff0000" },
  },
  {
    id: "coffee",
    label: "Coffee",
    preview: { bg: "#f7eee4", sidebar: "#ffffff", text: "#2c1810", muted: "#e2d0bc", accent: "#a85a28" },
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

export function readStoredTheme(): ThemeId {
  if (typeof window === "undefined") return "dark";
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    return isThemeId(raw) ? raw : "dark";
  } catch {
    return "dark";
  }
}

export const THEME_SURFACE: Record<ThemeId, string> = {
  light: "#ffffff",
  dark: "#1c1b1a",
  coffee: "#f7eee4",
  razer: "#111111",
  crimson: "#111111",
};

const LIGHT_THEMES: ReadonlySet<ThemeId> = new Set(["light", "coffee"]);

export function applyThemeChrome(theme: ThemeId, marketing = false): void {
  if (typeof document === "undefined") return;
  const color = marketing ? "#0a0a0a" : THEME_SURFACE[theme];
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
  barMeta.setAttribute("content", !marketing && LIGHT_THEMES.has(theme) ? "default" : "black");
}

export function applyThemeClass(theme: ThemeId): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.add("theme-switching");
  root.classList.remove(...THEMES, "marketing");
  root.classList.add(theme);
  root.dataset.theme = theme;
  applyThemeChrome(theme, false);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove("theme-switching");
    });
  });
}

export function applyMarketingDark(): void {
  applyThemeClass("dark");
  if (typeof document === "undefined") return;
  document.documentElement.classList.add("marketing");
  applyThemeChrome("dark", true);
}

export function persistTheme(theme: ThemeId): void {
  applyThemeClass(theme);
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_KEY, theme);
}
