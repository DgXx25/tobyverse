import { NextResponse, type NextRequest } from "next/server";
import { SIGNED_IN_COOKIE } from "@/lib/signed-in-cookie";

const APP_HOME = "/new";

function isAppPath(pathname: string) {
  return (
    pathname === APP_HOME ||
    pathname === "/dashboard" ||
    pathname === "/library" ||
    pathname.startsWith("/library/") ||
    pathname.startsWith("/project/") ||
    pathname === "/account" ||
    pathname.startsWith("/account/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  );
}

export function middleware(request: NextRequest) {
  const signedIn = request.cookies.get(SIGNED_IN_COOKIE)?.value === "1";
  const { pathname } = request.nextUrl;

  if (signedIn) {
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = APP_HOME;
      return NextResponse.rewrite(url);
    }
    if (pathname === "/login" || pathname === "/dashboard") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (pathname === "/dashboard") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  if (isAppPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/new", "/dashboard", "/library/:path*", "/project/:path*", "/account", "/account/:path*", "/admin/:path*"],
};
