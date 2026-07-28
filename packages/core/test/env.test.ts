import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseEnv, slackConfigOf } from "../src/config/env.js";

const TOKEN = "a".repeat(32);

function base(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { WEB_AUTH_TOKEN: TOKEN, ...overrides };
}

describe("parseEnv", () => {
  it("最小構成(WEB_AUTH_TOKENのみ)でデフォルト値が適用される", () => {
    const env = parseEnv(base());
    expect(env.WEB_PORT).toBe(32146);
    expect(env.MAX_CONCURRENT_JOBS).toBe(2);
    expect(env.MAX_CONCURRENT_JOBS_PER_PROJECT).toBe(1);
    expect(env.PERMISSION_TIMEOUT_SECONDS).toBe(3600);
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("WEB_AUTH_TOKENが短いと拒否する", () => {
    expect(() => parseEnv({ WEB_AUTH_TOKEN: "short" })).toThrow(/WEB_AUTH_TOKEN/);
  });

  it("WEB_AUTH_TOKENがないと拒否する", () => {
    expect(() => parseEnv({})).toThrow(/Invalid environment/);
  });

  it("~始まりのパスをホームディレクトリ展開する", () => {
    const env = parseEnv(base({ WORKTREE_ROOT: "~/wt" }));
    expect(env.WORKTREE_ROOT).toBe(path.join(os.homedir(), "wt"));
    expect(path.isAbsolute(env.DATABASE_PATH)).toBe(true);
  });

  it("数値系は文字列から変換し、範囲外を拒否する", () => {
    expect(parseEnv(base({ MAX_CONCURRENT_JOBS: "5" })).MAX_CONCURRENT_JOBS).toBe(5);
    expect(() => parseEnv(base({ MAX_CONCURRENT_JOBS: "0" }))).toThrow();
    expect(() => parseEnv(base({ WEB_PORT: "99999" }))).toThrow();
    expect(() => parseEnv(base({ PERMISSION_TIMEOUT_SECONDS: "1" }))).toThrow();
  });

  it("Slackトークンのプレフィックスを検証する", () => {
    expect(() => parseEnv(base({ SLACK_BOT_TOKEN: "invalid" }))).toThrow();
    expect(parseEnv(base({ SLACK_BOT_TOKEN: "xoxb-x" })).SLACK_BOT_TOKEN).toBe("xoxb-x");
    // 空文字はundefined扱い(.envの未記入行)
    expect(parseEnv(base({ SLACK_BOT_TOKEN: "" })).SLACK_BOT_TOKEN).toBeUndefined();
  });

  it("ALLOWED_SLACK_USER_IDSをカンマ区切りで分割する", () => {
    const env = parseEnv(base({ ALLOWED_SLACK_USER_IDS: "U01, U02 ,,U03" }));
    expect(env.ALLOWED_SLACK_USER_IDS).toEqual(["U01", "U02", "U03"]);
  });
});

describe("slackConfigOf", () => {
  it("不完全な設定ではnull(モック動作)", () => {
    expect(slackConfigOf(parseEnv(base()))).toBeNull();
    expect(slackConfigOf(parseEnv(base({ SLACK_BOT_TOKEN: "xoxb-x" })))).toBeNull();
  });

  it("完全な設定で構成を返す", () => {
    const env = parseEnv(
      base({
        SLACK_BOT_TOKEN: "xoxb-x",
        SLACK_APP_TOKEN: "xapp-x",
        SLACK_CHANNEL_ID: "C123",
        ALLOWED_SLACK_USER_IDS: "U01",
      }),
    );
    expect(slackConfigOf(env)).toEqual({
      botToken: "xoxb-x",
      appToken: "xapp-x",
      channelId: "C123",
      allowedUserIds: ["U01"],
    });
  });
});
