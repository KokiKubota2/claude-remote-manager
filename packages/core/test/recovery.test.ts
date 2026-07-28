import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockClaudeAdapter } from "../src/claude/mock-adapter";
import { transcriptPathOf } from "../src/claude/transcript";
import { ProjectRegistry } from "../src/config/projects";
import { openDb, type Db } from "../src/db/client";
import { createGitRunner } from "../src/git/exec";
import { WorktreeManager } from "../src/git/worktree";
import { JobManager } from "../src/jobs/manager";
import { createPendingAction, getPendingAction } from "../src/jobs/pending-actions";
import {
  appendJobEvent,
  createJob,
  getJob,
  listJobEvents,
  pruneJobEvents,
  transitionJob,
} from "../src/jobs/repository";
import type { CreateJobInput, Project } from "../src/types/index";

let tmpDir: string;
let db: Db;
let sqlite: { close(): void };
let project: Project;
let registry: ProjectRegistry;

const input: CreateJobInput = {
  projectId: "proj-a",
  task: "task",
  mode: "fix",
  workspaceMode: "worktree",
  options: { runTests: false, allowDependencyInstall: false, createCommit: false },
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-recover-"));
  const opened = openDb(path.join(tmpDir, "t.sqlite"));
  db = opened.db;
  sqlite = opened.sqlite;
  const repoPath = path.join(tmpDir, "repo");
  fs.mkdirSync(repoPath);
  execFileSync("git", ["init", "-q", repoPath]);
  project = {
    id: "proj-a",
    name: "A",
    repositoryPath: repoPath,
    defaultBranch: "main",
    packageManager: "unknown",
    enabled: true,
  };
  registry = new ProjectRegistry([project]);
});

afterEach(() => {
  sqlite.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeManager(): JobManager {
  return new JobManager({
    db,
    registry,
    worktrees: new WorktreeManager(createGitRunner(), path.join(tmpDir, "wt")),
    adapter: new MockClaudeAdapter(),
    permissionHandler: async () => ({ behavior: "deny", message: "x" }),
    maxConcurrentJobs: 1,
    maxConcurrentJobsPerProject: 1,
  });
}

/** cwdに対応するトランスクリプトファイルを偽装作成する */
function fakeTranscript(cwd: string, sessionId: string): string {
  const p = transcriptPathOf(cwd, sessionId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, '{"role":"assistant"}\n');
  return p;
}

describe("transcriptPathOf (capability-report §12)", () => {
  it("cwdの/と.を-に置換したディレクトリ配下を指す", () => {
    const p = transcriptPathOf("/Users/k.kubota/dev/app", "abc-123");
    expect(p).toBe(
      path.join(os.homedir(), ".claude", "projects", "-Users-k-kubota-dev-app", "abc-123.jsonl"),
    );
  });
});

describe("recoverOnStartup (§21.4)", () => {
  it("トランスクリプトがあるrunningジョブはwaiting_inputへ復旧する", () => {
    const job = createJob(db, project, input);
    transitionJob(db, job.id, "preparing");
    transitionJob(db, job.id, "starting");
    transitionJob(db, job.id, "running");
    const transcript = fakeTranscript(project.repositoryPath, job.claudeSessionId);

    try {
      makeManager().recoverOnStartup();
      expect(getJob(db, job.id)!.status).toBe("waiting_input");
    } finally {
      fs.rmSync(path.dirname(transcript), { recursive: true, force: true });
    }
  });

  it("トランスクリプトがないrunningジョブはorphanedになる", () => {
    const job = createJob(db, project, input);
    transitionJob(db, job.id, "preparing");
    transitionJob(db, job.id, "starting");
    transitionJob(db, job.id, "running");
    makeManager().recoverOnStartup();
    expect(getJob(db, job.id)!.status).toBe("orphaned");
  });

  it("preparing/startingはfailedになり、cancel_requestedはcancelledになる", () => {
    const a = createJob(db, project, input);
    transitionJob(db, a.id, "preparing");
    const b = createJob(db, project, input);
    transitionJob(db, b.id, "preparing");
    transitionJob(db, b.id, "starting");
    transitionJob(db, b.id, "running");
    transitionJob(db, b.id, "cancel_requested");

    makeManager().recoverOnStartup();
    expect(getJob(db, a.id)!.status).toBe("failed");
    expect(getJob(db, b.id)!.status).toBe("cancelled");
  });

  it("未回答の許可要求を失効させる(自動許可しない)", () => {
    const job = createJob(db, project, input);
    transitionJob(db, job.id, "preparing");
    transitionJob(db, job.id, "starting");
    transitionJob(db, job.id, "running");
    transitionJob(db, job.id, "waiting_permission");
    const action = createPendingAction(db, {
      jobId: job.id,
      type: "permission",
      request: { toolName: "Bash" },
      expiresAt: null,
    });
    makeManager().recoverOnStartup();
    expect(getPendingAction(db, action.id)!.status).toBe("cancelled");
  });

  it("queuedジョブは影響を受けない", () => {
    const job = createJob(db, project, input);
    makeManager().recoverOnStartup();
    expect(getJob(db, job.id)!.status).toBe("queued");
  });
});

describe("pruneJobEvents (§14.6)", () => {
  it("最新maxKeep件だけ残す", () => {
    const job = createJob(db, project, input);
    for (let i = 0; i < 30; i++) appendJobEvent(db, job.id, "log", { i });
    const removed = pruneJobEvents(db, job.id, 10);
    expect(removed).toBeGreaterThan(0);
    expect(listJobEvents(db, job.id, 1000)).toHaveLength(10);
  });
});
