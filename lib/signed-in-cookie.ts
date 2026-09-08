export const SIGNED_IN_COOKIE = "tv.signed-in";
export const POST_LOGIN_PATH = "/new";

export function hasSignedInCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((part) => part.trim().startsWith(`${SIGNED_IN_COOKIE}=1`));
}

export function writeSignedInCookie(on: boolean) {
  if (typeof document === "undefined") return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = on
    ? `${SIGNED_IN_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
    : `${SIGNED_IN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}
