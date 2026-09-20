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

/** Popup Google login cannot return here — new tab has no window.opener (Cursor/VS Code Simple Browser, Electron, iframes). */
export function authPopupUnreliable(): boolean {
  if (typeof window === "undefined") return false;
  if (isStandaloneDisplay()) return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  return /Electron/i.test(window.navigator.userAgent);
}

