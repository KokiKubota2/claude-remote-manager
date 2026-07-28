import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PermissionDecision, PermissionRequest } from "../src/claude/adapter";
import { MockClaudeAdapter, type MockScriptStep } from "../src/claude/mock-adapter";
import { ProjectRegistry } from "../src/config/projects";
import { openDb, type Db } from "../src/db/client";
import { createGitRunner } from "../src/git/exec";
import { WorktreeManager } from "../src/git/worktree";
import { JobManager, type JobLifecycleEvent } from "../src/jobs/manager";
import { createJob, getJob, listJobEvents, transitionJob } from "../src/jobs/repository";
import type { CreateJobInput, Project } from "../src/types/index";

/**
 * ダミーCLI(MockClaudeAdapter)を使ったJob Managerの結合テスト(§28.2)。
 */

let tmpDir: string;
let db: Db;
let sqlite: { close(): void };
let repoPath: string;
let worktreeRoot: string;
let project: Project;
let registry: ProjectRegistry;
let events: JobLifecycleEvent[];

const input: CreateJobInput = {
  projectId: "proj-a",
  task: "テストタスク",
  mode: "fix",
  workspaceMode: "worktree",
  options: { runTests: false, allowDependencyInstall: false, createCommit: false },
};

function gitIn(cwd: string, args: string[]): string {
  return execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
    cwd,
    encoding: "utf8",
  });
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-mgr-"));
  const opened = openDb(path.join(tmpDir, "test.sqlite"));
  db = opened.db;
  sqlite = opened.sqlite;

  const originPath = path.join(tmpDir, "origin.git");
  repoPath = path.join(tmpDir, "repo");
  fs.mkdirSync(originPath, { recursive: true });
  gitIn(tmpDir, ["init", "--bare", "-b", "develop", originPath]);
  gitIn(tmpDir, ["clone", originPath, repoPath]);
  fs.writeFileSync(path.join(repoPath, "README.md"), "# t\n");
  gitIn(repoPath, ["checkout", "-b", "develop"]);
  gitIn(repoPath, ["add", "."]);
  gitIn(repoPath, ["commit", "-m", "init"]);
  gitIn(repoPath, ["push", "-u", "origin", "develop"]);

  worktreeRoot = path.join(tmpDir, "worktrees");
  project = {
    id: "proj-a",
    name: "Project A",
    repositoryPath: repoPath,
    defaultBranch: "develop",
    packageManager: "unknown",
    enabled: true,
  };
  registry = new ProjectRegistry([project]);
  events = [];
});

afterEach(() => {
  sqlite.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeManager(
  script: MockScriptStep[] | ((opts: unknown) => MockScriptStep[]),
  permissionHandler?: (req: PermissionRequest) => Promise<PermissionDecision>,
  limits: { max?: number; perProject?: number } = {},
): { manager: JobManager; adapter: MockClaudeAdapter } {
  const adapter = new MockClaudeAdapter(
    typeof script === "function" ? script : () => script,
  );
  const manager = new JobManager({
    db,
    registry,
    worktrees: new WorktreeManager(createGitRunner(), worktreeRoot),
    adapter,
    permissionHandler:
      permissionHandler ??
      (async () => ({ behavior: "deny", message: "許可フロー未接続のため拒否" })),
    maxConcurrentJobs: limits.max ?? 2,
    maxConcurrentJobsPerProject: limits.perProject ?? 1,
    onJobEvent: (e) => events.push(e),
  });
  return { manager, adapter };
}

async function waitFor(cond: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("waitFor timeout");
}

describe("JobManager", () => {
  it("正常終了: worktree作成→実行→completed(§28.2)", async () => {
    const { manager, adapter } = makeManager([
      { type: "assistant", text: "調査中です" },
      { type: "result", text: "修正が完了しました" },
    ]);
    const job = createJob(db, project, input);
    await manager.tick();
    await waitFor(() => getJob(db, job.id)?.status === "completed");

    const done = getJob(db, job.id)!;
    expect(done.resultSummary).toBe("修正が完了しました");
    expect(done.worktreePath).toContain(worktreeRoot);
    expect(done.worktreeBranch).toBe(`claude/${job.id.replaceAll("_", "-")}`);
    expect(fs.existsSync(done.worktreePath!)).toBe(true);
    expect(done.startedAt).toBeTruthy();
    expect(done.completedAt).toBeTruthy();

    // 起動時のcwdとセッションID指定を確認
    expect(adapter.startedTurns[0]!.cwd).toBe(done.worktreePath);
    expect(adapter.startedTurns[0]!.sessionId).toBe(done.claudeSessionId);
    expect(adapter.startedTurns[0]!.resume).toBe(false);
    // CLAUDE系envのサニタイズとJOB_ID注入
    const env = adapter.startedTurns[0]!.env!;
    expect(env.CLAUDE_REMOTE_JOB_ID).toBe(job.id);
    expect(Object.keys(env).filter((k) => k.startsWith("CLAUDE_CODE"))).toHaveLength(0);

    expect(events.map((e) => e.type)).toContain("job_completed");
    const eventTypes = listJobEvents(db, job.id).map((e) => e.type);
    expect(eventTypes).toContain("log");
    expect(eventTypes).toContain("completed");
  });

  it("異常終了: isError=trueでfailed", async () => {
    const { manager } = makeManager([{ type: "result", text: "API rate limit", isError: true }]);
    const job = createJob(db, project, input);
    await manager.tick();
    await waitFor(() => getJob(db, job.id)?.status === "failed");
    expect(getJob(db, job.id)!.errorMessage).toBe("API rate limit");
    expect(events.map((e) => e.type)).toContain("job_failed");
  });

  it("許可要求: デフォルトハンドラはdenyし、waiting_permissionを経由する", async () => {
    const seenStatuses: string[] = [];
    const { manager } = makeManager(
      [
        {
          type: "permission",
          request: { toolName: "Bash", input: { command: "rm -rf /" } },
        },
        { type: "result", text: "拒否されたため中断しました" },
      ],
      async (req) => {
        seenStatuses.push(getJob(db, (events[0] as { job: { id: string } }).job.id)?.status ?? "?");
        expect(req.toolName).toBe("Bash");
        return { behavior: "deny", message: "手動拒否" };
      },
    );
    const job = createJob(db, project, input);
    await manager.tick();
    await waitFor(() => getJob(db, job.id)?.status === "completed");
    // ハンドラ実行中はwaiting_permission
    expect(seenStatuses).toContain("waiting_permission");
    const eventTypes = listJobEvents(db, job.id).map((e) => e.type);
    expect(eventTypes).toContain("permission_requested");
    expect(eventTypes).toContain("permission_answered");
  });

  it("許可要求: allowで続行する", async () => {
    const { manager } = makeManager(
      [
        { type: "permission", request: { toolName: "Bash", input: { command: "echo ok" } } },
        { type: "result", text: "実行しました" },
      ],
      async () => ({ behavior: "allow" }),
    );
    const job = createJob(db, project, input);
    await manager.tick();
    await waitFor(() => getJob(db, job.id)?.status === "completed");
    expect(getJob(db, job.id)!.resultSummary).toBe("実行しました");
  });

  it("停止: cancel_requested中に完了するとcancelledになる(§29 E)", async () => {
    const { manager } = makeManager([
      { type: "assistant", text: "長い処理", delayMs: 300 },
      { type: "result", text: "終了" },
    ]);
    const job = createJob(db, project, input);
    await manager.tick();
    await waitFor(() => getJob(db, job.id)?.status === "running");
    transitionJob(db, job.id, "cancel_requested");
    await manager.interruptIfActive(job.id);
    await waitFor(() => getJob(db, job.id)?.status === "cancelled");
    // worktreeは残る(§29 E-6)
    expect(fs.existsSync(getJob(db, job.id)!.worktreePath!)).toBe(true);
  });

  it("同時実行制御: perProject=1では同一プロジェクトの2件目はqueuedのまま(§18)", async () => {
    const { manager } = makeManager([
      { type: "assistant", text: "処理中", delayMs: 500 },
      { type: "result", text: "done" },
    ]);
    const a = createJob(db, project, input);
    const b = createJob(db, project, input);
    await manager.tick();
    await waitFor(() => getJob(db, a.id)?.status !== "queued");
    // 1件目が実行中の間、2件目はqueued
    expect(getJob(db, b.id)!.status).toBe("queued");
    await waitFor(() => getJob(db, a.id)?.status === "completed");
    await manager.tick();
    await waitFor(() => getJob(db, b.id)?.status === "completed", 15_000);
  });

  it("追加指示: completedのジョブをresumeで再実行する(§17)", async () => {
    const { manager, adapter } = makeManager([{ type: "result", text: "1回目完了" }]);
    const job = createJob(db, project, input);
    await manager.tick();
    await waitFor(() => getJob(db, job.id)?.status === "completed");

    await manager.sendMessage(job.id, "追加でBの修正もお願いします");
    await waitFor(() => getJob(db, job.id)?.status === "completed");
    expect(adapter.startedTurns).toHaveLength(2);
    expect(adapter.startedTurns[1]!.resume).toBe(true);
    expect(adapter.startedTurns[1]!.prompt).toBe("追加でBの修正もお願いします");
    expect(adapter.startedTurns[1]!.sessionId).toBe(job.claudeSessionId);
  });

  it("追加指示: 実行中のジョブには送れない", async () => {
    const { manager } = makeManager([
      { type: "assistant", text: "処理中", delayMs: 500 },
      { type: "result", text: "done" },
    ]);
    const job = createJob(db, project, input);
    await manager.tick();
    await waitFor(() => getJob(db, job.id)?.status === "running");
    await expect(manager.sendMessage(job.id, "x")).rejects.toThrow(/実行中/);
    await waitFor(() => getJob(db, job.id)?.status === "completed");
  });

  it("worktree作成失敗でfailedになる", async () => {
    // 同名ブランチを先に作って衝突させる
    const { manager } = makeManager([{ type: "result", text: "unused" }]);
    const job = createJob(db, project, input);
    gitIn(repoPath, ["branch", `claude/${job.id.replaceAll("_", "-")}`]);
    await manager.tick();
    await waitFor(() => getJob(db, job.id)?.status === "failed");
    expect(getJob(db, job.id)!.errorMessage).toContain("worktree作成に失敗");
  });
});
