import { describe, expect, it } from "vitest";
import { sanitizeClaudeEnv } from "../src/claude/env";

describe("sanitizeClaudeEnv (capability-report §14-1-5)", () => {
  it("CLAUDE系環境変数を除去する", () => {
    const out = sanitizeClaudeEnv({
      PATH: "/usr/bin",
      HOME: "/Users/x",
      CLAUDECODE: "1",
      CLAUDE_CODE_CHILD_SESSION: "1",
      CLAUDE_CODE_SESSION_ID: "abc",
      CLAUDE_PID: "123",
      CLAUDE_EFFORT: "high",
    });
    expect(out.PATH).toBe("/usr/bin");
    expect(out.HOME).toBe("/Users/x");
    expect(out.CLAUDECODE).toBeUndefined();
    expect(out.CLAUDE_CODE_CHILD_SESSION).toBeUndefined();
    expect(out.CLAUDE_CODE_SESSION_ID).toBeUndefined();
    expect(out.CLAUDE_PID).toBeUndefined();
    expect(out.CLAUDE_EFFORT).toBeUndefined();
  });

  it("extraで明示した変数は追加される(CLAUDE_REMOTE_JOB_ID)", () => {
    const out = sanitizeClaudeEnv({ CLAUDE_CODE_X: "y" }, { CLAUDE_REMOTE_JOB_ID: "job_1" });
    expect(out.CLAUDE_REMOTE_JOB_ID).toBe("job_1");
    expect(out.CLAUDE_CODE_X).toBeUndefined();
  });

  it("undefined値を除外する", () => {
    const out = sanitizeClaudeEnv({ A: undefined, B: "b" });
    expect("A" in out).toBe(false);
    expect(out.B).toBe("b");
  });
});
