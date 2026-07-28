import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGitRunner } from "../src/git/exec";
import { WorktreeError, WorktreeManager } from "../src/git/worktree";

/**
 * 実gitリポジトリを使った結合テスト(§28.2)。
 * originはローカルのbareリポジトリで代用する。
 */

let tmpDir: string;
let originPath: string;
let repoPath: string;
let worktreeRoot: string;
let manager: WorktreeManager;

function sh(cwd: string, cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { cwd, encoding: "utf8" });
}

function gitIn(cwd: string, args: string[]): string {
  return sh(cwd, "git", [
    "-c",
    "user.email=test@test",
    "-c",
    "user.name=test",
    ...args,
  ]);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-wt-"));
  originPath = path.join(tmpDir, "origin.git");
  repoPath = path.join(tmpDir, "repo");
  worktreeRoot = path.join(tmpDir, "worktrees");

  // origin(bare) + clone を作る
  fs.mkdirSync(originPath, { recursive: true });
  gitIn(tmpDir, ["init", "--bare", "-b", "develop", originPath]);
  gitIn(tmpDir, ["clone", originPath, repoPath]);
  fs.writeFileSync(path.join(repoPath, "README.md"), "# test\n");
  gitIn(repoPath, ["checkout", "-b", "develop"]);
  gitIn(repoPath, ["add", "."]);
  gitIn(repoPath, ["commit", "-m", "init"]);
  gitIn(repoPath, ["push", "-u", "origin", "develop"]);

  manager = new WorktreeManager(createGitRunner(), worktreeRoot);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("createJobWorktree", () => {
  it("worktreeとブランチを作成する", async () => {
    const info = await manager.createJobWorktree({
      repoPath,
      projectId: "proj-a",
      jobId: "job_20260728_001",
      baseBranch: "develop",
    });
    expect(info.branch).toBe("claude/job-20260728-001");
    expect(info.baseRef).toBe("origin/develop");
    expect(fs.existsSync(path.join(info.worktreePath, "README.md"))).toBe(true);
  });

  it("同名ブランチが存在すると拒否する(§11.3)", async () => {
    gitIn(repoPath, ["branch", "claude/job-20260728-001"]);
    await expect(
      manager.createJobWorktree({
        repoPath,
        projectId: "proj-a",
        jobId: "job_20260728_001",
        baseBranch: "develop",
      }),
    ).rejects.toThrow(/Branch already exists/);
  });

  it("worktreeパスが存在すると拒否する(§11.3)", async () => {
    const wtPath = path.join(worktreeRoot, "proj-a", "job-20260728-001");
    fs.mkdirSync(wtPath, { recursive: true });
    await expect(
      manager.createJobWorktree({
        repoPath,
        projectId: "proj-a",
        jobId: "job_20260728_001",
        baseBranch: "develop",
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("存在しないベースブランチを拒否する", async () => {
    await expect(
      manager.createJobWorktree({
        repoPath,
        projectId: "proj-a",
        jobId: "job_20260728_001",
        baseBranch: "nope",
      }),
    ).rejects.toThrow(/Base branch not found/);
  });

  it("gitリポジトリでないパスを拒否する", async () => {
    const notRepo = path.join(tmpDir, "not-repo");
    fs.mkdirSync(notRepo);
    await expect(
      manager.createJobWorktree({
        repoPath: notRepo,
        projectId: "proj-a",
        jobId: "job_20260728_001",
        baseBranch: "develop",
      }),
    ).rejects.toThrow(WorktreeError);
  });

  it("既存作業ディレクトリの未コミット変更に影響しない(§11.3)", async () => {
    fs.writeFileSync(path.join(repoPath, "wip.txt"), "uncommitted work");
    await manager.createJobWorktree({
      repoPath,
      projectId: "proj-a",
      jobId: "job_20260728_001",
      baseBranch: "develop",
    });
    expect(fs.readFileSync(path.join(repoPath, "wip.txt"), "utf8")).toBe("uncommitted work");
  });
});

describe("diffSummary / fileDiff", () => {
  it("追加・変更・未追跡ファイルを集計する", async () => {
    const { worktreePath, baseRef } = await manager.createJobWorktree({
      repoPath,
      projectId: "proj-a",
      jobId: "job_20260728_001",
      baseBranch: "develop",
    });
    // コミット済み変更
    fs.appendFileSync(path.join(worktreePath, "README.md"), "line2\nline3\n");
    gitIn(worktreePath, ["add", "."]);
    gitIn(worktreePath, ["commit", "-m", "update readme"]);
    // 未コミット変更 + 未追跡ファイル
    fs.appendFileSync(path.join(worktreePath, "README.md"), "line4\n");
    fs.writeFileSync(path.join(worktreePath, "new.txt"), "a\nb\n");

    const summary = await manager.diffSummary(worktreePath, baseRef);
    const readme = summary.files.find((f) => f.path === "README.md");
    const added = summary.files.find((f) => f.path === "new.txt");
    expect(readme).toBeDefined();
    expect(readme!.additions).toBeGreaterThanOrEqual(3);
    expect(added).toBeDefined();
    expect(summary.totalAdditions).toBeGreaterThan(0);

    const diff = await manager.fileDiff(worktreePath, baseRef, "README.md");
    expect(diff).toContain("+line2");
  });

  it("fileDiffのパストラバーサルを拒否する", async () => {
    const { worktreePath, baseRef } = await manager.createJobWorktree({
      repoPath,
      projectId: "proj-a",
      jobId: "job_20260728_001",
      baseBranch: "develop",
    });
    await expect(manager.fileDiff(worktreePath, baseRef, "../outside")).rejects.toThrow(
      WorktreeError,
    );
    await expect(manager.fileDiff(worktreePath, baseRef, "/etc/passwd")).rejects.toThrow(
      WorktreeError,
    );
  });
});

describe("commitAll", () => {
  it("差分があればコミットしSHAを返す", async () => {
    const { worktreePath } = await manager.createJobWorktree({
      repoPath,
      projectId: "proj-a",
      jobId: "job_20260728_001",
      baseBranch: "develop",
    });
    fs.writeFileSync(path.join(worktreePath, "change.txt"), "x\n");
    const sha = await manager.commitAll(worktreePath, "claude: apply changes");
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("差分がなければ拒否する(§11.4)", async () => {
    const { worktreePath } = await manager.createJobWorktree({
      repoPath,
      projectId: "proj-a",
      jobId: "job_20260728_001",
      baseBranch: "develop",
    });
    await expect(manager.commitAll(worktreePath, "empty")).rejects.toThrow(/No changes/);
  });
});

describe("removeWorktree", () => {
  it("worktreeを削除しブランチを保持できる", async () => {
    const { worktreePath, branch } = await manager.createJobWorktree({
      repoPath,
      projectId: "proj-a",
      jobId: "job_20260728_001",
      baseBranch: "develop",
    });
    await manager.removeWorktree({ repoPath, worktreePath, branch, keepBranch: true });
    expect(fs.existsSync(worktreePath)).toBe(false);
    expect(gitIn(repoPath, ["branch", "--list", branch]).trim()).toContain(branch);
  });

  it("ブランチごと削除できる", async () => {
    const { worktreePath, branch } = await manager.createJobWorktree({
      repoPath,
      projectId: "proj-a",
      jobId: "job_20260728_001",
      baseBranch: "develop",
    });
    await manager.removeWorktree({ repoPath, worktreePath, branch, keepBranch: false });
    expect(gitIn(repoPath, ["branch", "--list", branch]).trim()).toBe("");
  });

  it("worktreeRoot外のパス削除を拒否する", async () => {
    await expect(
      manager.removeWorktree({
        repoPath,
        worktreePath: "/etc",
        branch: "x",
        keepBranch: true,
      }),
    ).rejects.toThrow(/outside worktree root/);
  });
});

describe("listRemoteBranches", () => {
  it("originのブランチ一覧を返す(§11.2)", async () => {
    gitIn(repoPath, ["checkout", "-b", "feature/x"]);
    gitIn(repoPath, ["push", "-u", "origin", "feature/x"]);
    gitIn(repoPath, ["checkout", "develop"]);
    await manager.fetchOrigin(repoPath);
    const branches = await manager.listRemoteBranches(repoPath);
    expect(branches).toContain("develop");
    expect(branches).toContain("feature/x");
  });
});
