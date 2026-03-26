import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const pathname = nextUrl.pathname;

  // Skip auth routes and the onboarding page itself
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/user/alias")
  ) {
    return NextResponse.next();
  }

  // Authenticated user with no alias → send to onboarding
  if (session?.user && !session.user.alias) {
    return NextResponse.redirect(new URL("/onboarding", nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|webp|ico)).*)"],
};
