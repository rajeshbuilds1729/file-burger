import { NextResponse } from "next/server";

/** Standard JSON error response: { error: code, message }. */
export function jsonError(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json({ error: code, message }, { status });
}

/** Best-effort client IP for rate limiting. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0];
    if (first) return first.trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}
