import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@claude-remote/core";
import { requireAuthApi } from "@/lib/server/auth";

export async function POST(request: NextRequest) {
  const unauthorized = requireAuthApi(request);
  if (unauthorized) return unauthorized;
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
