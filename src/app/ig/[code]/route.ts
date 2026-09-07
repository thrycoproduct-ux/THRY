import { NextResponse, type NextRequest } from "next/server";
import { buildInstagramShortLinkTarget } from "@/lib/marketing/instagram-short-links";

/** thryco.com/ig/<code> → collection/shop page tagged with Instagram UTMs. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const target = buildInstagramShortLinkTarget(code, request.nextUrl.origin);

  // 302 (not 301/308): mapping may change; never let browsers pin it.
  return NextResponse.redirect(target, {
    status: 302,
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=300",
    },
  });
}
