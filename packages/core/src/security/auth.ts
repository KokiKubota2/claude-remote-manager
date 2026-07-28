import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Web認証(§19.1)。単一ユーザーMVP:
 * - ログイン時にWEB_AUTH_TOKENを検証し、HMAC派生のセッション値をCookieへ格納
 * - Cookie値はトークンそのものではないため、URL等へ漏れてもトークンは露出しない
 */

const SESSION_CONTEXT = "claude-remote-session-v1";

export function sessionValueOf(authToken: string): string {
  return createHmac("sha256", authToken).update(SESSION_CONTEXT).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verifyLoginToken(authToken: string, submitted: string): boolean {
  return safeEqual(authToken, submitted.trim());
}

export function verifySessionCookie(authToken: string, cookieValue: string): boolean {
  return safeEqual(sessionValueOf(authToken), cookieValue);
}

export const SESSION_COOKIE_NAME = "crm_session";
