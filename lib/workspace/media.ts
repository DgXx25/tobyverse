export const MOBILE_MQ = "(max-width: 767px)";

export function isMobileWidth(): boolean {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_MQ).matches;
}
