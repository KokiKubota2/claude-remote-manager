import { describe, expect, it } from "vitest";
import {
  sessionValueOf,
  verifyLoginToken,
  verifySessionCookie,
} from "../src/security/auth";

const TOKEN = "x".repeat(48);

describe("Web認証(§19.1)", () => {
  it("正しいトークンでログインできる", () => {
    expect(verifyLoginToken(TOKEN, TOKEN)).toBe(true);
    expect(verifyLoginToken(TOKEN, ` ${TOKEN} `)).toBe(true);
  });

  it("誤ったトークンを拒否する", () => {
    expect(verifyLoginToken(TOKEN, "wrong")).toBe(false);
    expect(verifyLoginToken(TOKEN, TOKEN + "x")).toBe(false);
    expect(verifyLoginToken(TOKEN, "")).toBe(false);
  });

  it("セッションCookie値はトークンそのものではない", () => {
    const session = sessionValueOf(TOKEN);
    expect(session).not.toContain(TOKEN);
    expect(session).toMatch(/^[0-9a-f]{64}$/);
  });

  it("セッションCookieを検証できる", () => {
    const session = sessionValueOf(TOKEN);
    expect(verifySessionCookie(TOKEN, session)).toBe(true);
    expect(verifySessionCookie(TOKEN, "tampered")).toBe(false);
    expect(verifySessionCookie("other-token".repeat(5), session)).toBe(false);
  });
});
