export const THEME_KEY = "tv.theme";

export const THEMES = ["light", "dark"] as const;

export type ThemeId = (typeof THEMES)[number];

const LEGACY_THEMES = ["coffee", "razer", "crimson"] as const;

export const THEME_OPTIONS: { id: ThemeId; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

export function readStoredTheme(): ThemeId {
  if (typeof window === "undefined") return "dark";
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    if (raw === "coffee") return "light";
    return isThemeId(raw) ? raw : "dark";
  } catch {
    return "dark";
  }
}

export function applyThemeClass(theme: ThemeId): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.add("theme-switching");
  root.classList.remove(...THEMES, ...LEGACY_THEMES);
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
