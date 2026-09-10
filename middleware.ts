import { NextResponse, type NextRequest } from "next/server";
import { POST_LOGIN_PATH, SIGNED_IN_COOKIE } from "@/lib/signed-in-cookie";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = request.cookies.get(SIGNED_IN_COOKIE)?.value === "1";
  // Home Screen web apps send sec-fetch-site: none. A 302 here kicks iOS into Safari chrome.
  const homeScreenLaunch = request.headers.get("sec-fetch-site") === "none";

  if (pathname === "/dashboard") {
    const url = request.nextUrl.clone();
    url.pathname = POST_LOGIN_PATH;
    return NextResponse.redirect(url);
  }

  if (signedIn && (pathname === "/" || pathname === "/login") && !homeScreenLaunch) {
    const url = request.nextUrl.clone();
    url.pathname = POST_LOGIN_PATH;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/dashboard"],
};
