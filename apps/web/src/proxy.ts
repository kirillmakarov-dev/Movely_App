import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const locale = request.nextUrl.pathname.match(/^\/(en|ru)(?:\/|$)/)?.[1] ?? "he";
  const headers = new Headers(request.headers);
  // Always overwrite a caller-supplied value. The URL is the source of truth.
  headers.set("x-movely-locale", locale);
  headers.set("x-movely-path", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ["/((?!api/|_next/|.*\\.[^/]+$).*)"] };
