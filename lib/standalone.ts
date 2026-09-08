export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;

  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;

  try {
    return window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    return false;
  }
}
