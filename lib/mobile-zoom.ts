/** Blocks pinch / Safari gesture zoom. Double-tap zoom is handled in CSS + viewport. */
export function lockMobileZoom(): () => void {
  const block = (event: Event) => {
    event.preventDefault();
  };
  document.addEventListener("gesturestart", block, { passive: false });
  document.addEventListener("gesturechange", block, { passive: false });
  document.addEventListener("gestureend", block, { passive: false });
  return () => {
    document.removeEventListener("gesturestart", block);
    document.removeEventListener("gesturechange", block);
    document.removeEventListener("gestureend", block);
  };
}

export function markIosStandalone(): void {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) {
    document.documentElement.classList.add("ios-standalone");
  }
}
