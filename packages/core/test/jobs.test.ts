import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../src/db/client";
import {
  JobStateError,
  countActiveJobs,
  createJob,
  generateJobId,
  jobTitleOf,
  listJobEvents,
  listJobs,
  transitionJob,
} from "../src/jobs/repository";
import type { CreateJobInput, Project } from "../src/types/index";

let tmpDir: string;
let db: Db;
let sqlite: { close(): void };

const project: Project = {
  id: "proj-a",
  name: "Project A",
  repositoryPath: "/tmp/proj-a",
  defaultBranch: "develop",
  packageManager: "pnpm",
  enabled: true,
};

const input: CreateJobInput = {
  projectId: "proj-a",
  task: "500エラーを調査して修正してください\n詳細...",
  mode: "fix",
  workspaceMode: "worktree",
  options: { runTests: true, allowDependencyInstall: false, createCommit: false },
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-jobs-"));
  const opened = openDb(path.join(tmpDir, "test.sqlite"));
  db = opened.db;
  sqlite = opened.sqlite;
});

afterEach(() => {
  sqlite.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("generateJobId", () => {
  it("job_YYYYMMDD_NNN形式で連番を採番する", () => {
    const now = new Date("2026-07-28T10:00:00Z");
    expect(generateJobId(db, now)).toBe("job_20260728_001");
    createJob(db, project, input);
    expect(generateJobId(db)).toMatch(/^job_\d{8}_002$/);
  });
});

describe("jobTitleOf", () => {
  it("明示タイトルを優先し、なければタスク先頭行を使う", () => {
    expect(jobTitleOf({ ...input, title: "  手動タイトル " })).toBe("手動タイトル");
    expect(jobTitleOf(input)).toBe("500エラーを調査して修正してください");
    expect(jobTitleOf({ ...input, task: "   \n\n  " })).toBe("(無題タスク)");
  });
});

describe("createJob / listJobs", () => {
  it("queuedで作成しセッションUUIDを事前採番する", () => {
    const job = createJob(db, project, input);
    expect(job.status).toBe("queued");
    expect(job.baseBranch).toBe("develop");
    expect(job.claudeSessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(listJobs(db)).toHaveLength(1);
    expect(listJobEvents(db, job.id)[0]?.type).toBe("created");
  });

  it("baseBranch指定を尊重する", () => {
    const job = createJob(db, project, { ...input, baseBranch: "main" });
    expect(job.baseBranch).toBe("main");
  });

  it("プロジェクト・状態でフィルタできる", () => {
    const job = createJob(db, project, input);
    expect(listJobs(db, { projectId: "proj-a" })).toHaveLength(1);
    expect(listJobs(db, { projectId: "other" })).toHaveLength(0);
    expect(listJobs(db, { statuses: ["queued"] })).toHaveLength(1);
    transitionJob(db, job.id, "preparing");
    expect(listJobs(db, { statuses: ["queued"] })).toHaveLength(0);
  });
});

describe("transitionJob", () => {
  it("正当な遷移を許可しupdatedAtを更新する", () => {
    const job = createJob(db, project, input);
    const updated = transitionJob(db, job.id, "preparing");
    expect(updated.status).toBe("preparing");
  });

  it("不正な遷移をJobStateErrorで拒否する(§28.1 状態遷移)", () => {
    const job = createJob(db, project, input);
    expect(() => transitionJob(db, job.id, "completed")).toThrow(JobStateError);
    expect(() => transitionJob(db, "job_none", "preparing")).toThrow(JobStateError);
  });

  it("パッチを同時に適用できる", () => {
    const job = createJob(db, project, input);
    transitionJob(db, job.id, "preparing");
    const updated = transitionJob(db, job.id, "starting", {
      worktreePath: "/tmp/wt",
      worktreeBranch: "claude/job-x",
    });
    expect(updated.worktreePath).toBe("/tmp/wt");
  });
});

describe("countActiveJobs", () => {
  it("実行中系ステータスのみ数える(§18)", () => {
    const a = createJob(db, project, input);
    createJob(db, project, input);
    expect(countActiveJobs(db)).toBe(2);
    expect(countActiveJobs(db, "proj-a")).toBe(2);
    transitionJob(db, a.id, "cancelled");
    expect(countActiveJobs(db)).toBe(1);
    expect(countActiveJobs(db, "other")).toBe(0);
  });
});
