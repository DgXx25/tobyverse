export const THEME_KEY = "tv.theme";

export const THEMES = ["light", "dark", "razer", "crimson", "coffee"] as const;

export type ThemeId = (typeof THEMES)[number];

export type ThemePreview = {
  bg: string;
  sidebar: string;
  text: string;
  muted: string;
};

export const THEME_OPTIONS: { id: ThemeId; label: string; preview: ThemePreview }[] = [
  {
    id: "light",
    label: "Light",
    preview: { bg: "#ffffff", sidebar: "#f4f4f5", text: "#18181b", muted: "#d4d4d8" },
  },
  {
    id: "dark",
    label: "Dark",
    preview: { bg: "#0a0a0a", sidebar: "#161616", text: "#ececec", muted: "#3a3a3a" },
  },
  {
    id: "razer",
    label: "Razer",
    preview: { bg: "#0a0a0a", sidebar: "#161616", text: "#ececec", muted: "#00ff00" },
  },
  {
    id: "crimson",
    label: "Crimson",
    preview: { bg: "#0a0a0a", sidebar: "#161616", text: "#ececec", muted: "#ff0000" },
  },
  {
    id: "coffee",
    label: "Coffee",
    preview: { bg: "#f7eee4", sidebar: "#ffffff", text: "#2c1810", muted: "#e2d0bc" },
  },
];

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

export function applyThemeClass(theme: ThemeId): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.add("theme-switching");
  root.classList.remove(...THEMES);
  root.classList.add(theme);
  root.dataset.theme = theme;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove("theme-switching");
    });
  });
}

export function persistTheme(theme: ThemeId): void {
  applyThemeClass(theme);
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_KEY, theme);
}
