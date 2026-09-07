export const SIGNED_IN_COOKIE = "tv.signed-in";

export function writeSignedInCookie(on: boolean) {
  if (typeof document === "undefined") return;
  document.cookie = on
    ? `${SIGNED_IN_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax`
    : `${SIGNED_IN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
