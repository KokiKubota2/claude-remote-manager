import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PermissionRequest } from "../src/claude/adapter";
import { openDb, type Db } from "../src/db/client";
import { PendingActionError, listPendingActions } from "../src/jobs/pending-actions";
import { PermissionBroker } from "../src/jobs/permission-broker";
import { createJob } from "../src/jobs/repository";
import { MockSlackBridge } from "../src/slack/mock";
import type { CreateJobInput, Project } from "../src/types/index";

let tmpDir: string;
let db: Db;
let sqlite: { close(): void };
let slack: MockSlackBridge;
let jobId: string;

const project: Project = {
  id: "proj-a",
  name: "Project A",
  repositoryPath: "/tmp/x",
  defaultBranch: "main",
  packageManager: "unknown",
  enabled: true,
};

const input: CreateJobInput = {
  projectId: "proj-a",
  task: "task",
  mode: "fix",
  workspaceMode: "worktree",
  options: { runTests: false, allowDependencyInstall: false, createCommit: false },
};

const request: PermissionRequest = {
  toolName: "Bash",
  input: { command: "pnpm add zod" },
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-broker-"));
  const opened = openDb(path.join(tmpDir, "t.sqlite"));
  db = opened.db;
  sqlite = opened.sqlite;
  slack = new MockSlackBridge();
  jobId = createJob(db, project, input).id;
});

afterEach(() => {
  sqlite.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeBroker(timeoutSeconds = 30): PermissionBroker {
  return new PermissionBroker(db, slack, timeoutSeconds);
}

function pendingIdFromSlack(): string {
  const post = slack.posts.find((p) => p.type === "permission_request");
  return (post!.detail as { pendingActionId: string }).pendingActionId;
}

describe("PermissionBroker (§16.1, §29 シナリオB)", () => {
  it("allow回答でallowを返しSlackメッセージを更新する", async () => {
    const broker = makeBroker();
    const decisionPromise = broker.handler(jobId, request, new AbortController().signal);
    await new Promise((r) => setTimeout(r, 20));

    expect(slack.posts.filter((p) => p.type === "permission_request")).toHaveLength(1);
    expect(listPendingActions(db, jobId)).toHaveLength(1);

    const { jobTitle } = await broker.answer(pendingIdFromSlack(), "allow_once", "U_TEST");
    expect(jobTitle).toBe("task");

    const decision = await decisionPromise;
    expect(decision.behavior).toBe("allow");
    expect(listPendingActions(db, jobId)).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 20));
    expect(slack.posts.some((p) => p.type === "permission_answered")).toBe(true);
  });

  it("deny回答でdenyを返す", async () => {
    const broker = makeBroker();
    const decisionPromise = broker.handler(jobId, request, new AbortController().signal);
    await new Promise((r) => setTimeout(r, 20));
    await broker.answer(pendingIdFromSlack(), "deny", "U_TEST");
    const decision = await decisionPromise;
    expect(decision.behavior).toBe("deny");
  });

  it("二重回答を拒否する(§29 B-5)", async () => {
    const broker = makeBroker();
    const decisionPromise = broker.handler(jobId, request, new AbortController().signal);
    await new Promise((r) => setTimeout(r, 20));
    const id = pendingIdFromSlack();
    await broker.answer(id, "allow_once", "U_1");
    await expect(broker.answer(id, "deny", "U_2")).rejects.toThrow(PendingActionError);
    await expect(broker.answer(id, "allow_once", "U_2")).rejects.toThrow(/処理済み/);
    const decision = await decisionPromise;
    expect(decision.behavior).toBe("allow"); // 最初の回答が有効
  });

  it("timeoutで自動許可せずdeny+expiredになる(§16.1)", async () => {
    const broker = makeBroker(0.1); // 100ms
    const decision = await broker.handler(jobId, request, new AbortController().signal);
    expect(decision.behavior).toBe("deny");
    if (decision.behavior === "deny") {
      expect(decision.message).toContain("回答がなかったため拒否");
    }
    // 期限切れ後の回答は拒否される
    await new Promise((r) => setTimeout(r, 20));
    await expect(broker.answer(pendingIdFromSlack(), "allow_once", "U_1")).rejects.toThrow(
      /処理済み/,
    );
  });

  it("シグナル中断でdenyになり自動許可しない", async () => {
    const broker = makeBroker();
    const abort = new AbortController();
    const decisionPromise = broker.handler(jobId, request, abort.signal);
    await new Promise((r) => setTimeout(r, 20));
    abort.abort();
    const decision = await decisionPromise;
    expect(decision.behavior).toBe("deny");
  });

  it("detailsが要求内容を返し秘密情報をマスクする", async () => {
    const broker = makeBroker();
    const decisionPromise = broker.handler(
      jobId,
      { toolName: "Bash", input: { command: "export API_KEY=supersecret99" } },
      new AbortController().signal,
    );
    await new Promise((r) => setTimeout(r, 20));
    const details = await broker.details(pendingIdFromSlack());
    expect(details).toContain("Bash");
    expect(details).not.toContain("supersecret99");
    await broker.answer(pendingIdFromSlack(), "deny", "U");
    await decisionPromise;
  });
});
