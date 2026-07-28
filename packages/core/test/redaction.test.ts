import { describe, expect, it } from "vitest";
import { redactSecrets } from "../src/security/redaction";

describe("redactSecrets (§19.5)", () => {
  it("Slackトークンをマスクする", () => {
    expect(redactSecrets("token: xoxb-1234567890-abcdefghij")).not.toContain("xoxb-12345");
    expect(redactSecrets("xapp-1-A123-456-abcdefghijklmnop")).not.toContain("xapp-1-A123");
  });

  it("APIキー系の代入をマスクする", () => {
    const cases = [
      "API_KEY=abc123def456",
      "MY_SECRET: supersecretvalue",
      'DATABASE_PASSWORD="hunter2hunter2"',
      "CLIENT_SECRET=xyz98765",
    ];
    for (const c of cases) {
      const masked = redactSecrets(c);
      expect(masked).toContain("[REDACTED]");
      expect(masked).not.toMatch(/abc123def456|supersecretvalue|hunter2hunter2|xyz98765/);
    }
  });

  it("Authorizationヘッダをマスクする", () => {
    const masked = redactSecrets("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig");
    expect(masked).not.toContain("eyJhbGciOiJIUzI1NiJ9");
  });

  it("sk-キーとGitHubトークンをマスクする", () => {
    expect(redactSecrets("sk-ant-api03-abcdefghijklmnop")).toContain("[REDACTED]");
    expect(redactSecrets("ghp_abcdefghijklmnopqrstuvwxyz123456")).toContain("[REDACTED]");
  });

  it("PEM秘密鍵をマスクする", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nMIIabc\ndef\n-----END PRIVATE KEY-----";
    expect(redactSecrets(pem)).toBe("[REDACTED]");
  });

  it("普通のテキストは変更しない", () => {
    const text = "READMEを更新しました。テストは全て成功です。";
    expect(redactSecrets(text)).toBe(text);
    const code = "const total = price * tax;";
    expect(redactSecrets(code)).toBe(code);
  });
});
