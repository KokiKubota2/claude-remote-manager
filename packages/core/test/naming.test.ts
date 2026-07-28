import path from "node:path";
import { describe, expect, it } from "vitest";
import { worktreeBranchOf, worktreePathOf } from "../src/git/naming";

describe("worktreeBranchOf (§11.1)", () => {
  it("job IDからブランチ名を生成する", () => {
    expect(worktreeBranchOf("job_20260728_001")).toBe("claude/job-20260728-001");
  });

  it("不正なjob ID形式を拒否する", () => {
    expect(() => worktreeBranchOf("job_x")).toThrow();
    expect(() => worktreeBranchOf("../etc")).toThrow();
    expect(() => worktreeBranchOf("job_20260728_001; rm -rf /")).toThrow();
  });
});

describe("worktreePathOf (§11.1)", () => {
  it("worktreeパスを生成する", () => {
    expect(worktreePathOf("/root/wt", "mego-api", "job_20260728_001")).toBe(
      path.join("/root/wt", "mego-api", "job-20260728-001"),
    );
  });

  it("不正なプロジェクトIDを拒否する", () => {
    expect(() => worktreePathOf("/root", "../escape", "job_20260728_001")).toThrow();
    expect(() => worktreePathOf("/root", "UPPER", "job_20260728_001")).toThrow();
  });
});
