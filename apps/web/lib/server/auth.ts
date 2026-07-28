import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionCookie } from "@claude-remote/core";
import { services } from "./services";

export async function hasValidSession(): Promise<boolean> {
  const { env } = services();
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return !!cookie && verifySessionCookie(env.WEB_AUTH_TOKEN, cookie);
}

/** サーバーページ用: 未認証なら/loginへリダイレクト */
export async function requireAuthPage(): Promise<void> {
  if (!(await hasValidSession())) redirect("/login");
}

/** Route Handler用: 未認証なら401レスポンスを返す */
export function requireAuthApi(request: NextRequest): NextResponse | null {
  const { env } = services();
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!cookie || !verifySessionCookie(env.WEB_AUTH_TOKEN, cookie)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
