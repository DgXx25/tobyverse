import { NextResponse, type NextRequest } from "next/server";
import { POST_LOGIN_PATH } from "@/lib/signed-in-cookie";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/dashboard") {
    const url = request.nextUrl.clone();
    url.pathname = POST_LOGIN_PATH;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/dashboard"],
};
