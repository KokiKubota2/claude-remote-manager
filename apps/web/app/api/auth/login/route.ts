import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, sessionValueOf, verifyLoginToken } from "@claude-remote/core";
import { services } from "@/lib/server/services";

export async function POST(request: NextRequest) {
  const { env } = services();
  let token = "";
  try {
    const body = (await request.json()) as { token?: string };
    token = body.token ?? "";
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  if (!verifyLoginToken(env.WEB_AUTH_TOKEN, token)) {
    return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  // Secureはリクエストが実際にHTTPSのときだけ付ける。
  // LAN内HTTP(Tailscale含む)でSecureを付けるとブラウザがCookieを破棄し、
  // ログインが成功してもセッションが保存されずログイン画面へ戻ってしまう。
  const isHttps =
    request.nextUrl.protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";
  response.cookies.set(SESSION_COOKIE_NAME, sessionValueOf(env.WEB_AUTH_TOKEN), {
    httpOnly: true,
    secure: isHttps,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
