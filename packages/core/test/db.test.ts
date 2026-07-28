import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb } from "../src/db/client";
import { jobs } from "../src/db/schema";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-db-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("openDb", () => {
  it("マイグレーションを適用しjobsへ読み書きできる", () => {
    const { db, sqlite } = openDb(path.join(tmpDir, "test.sqlite"));
    const now = new Date().toISOString();
    db.insert(jobs)
      .values({
        id: "job_1",
        projectId: "proj-a",
        title: "test",
        task: "do something",
        mode: "fix",
        status: "queued",
        baseBranch: "main",
        claudeSessionId: "00000000-0000-4000-8000-000000000000",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const rows = db.select().from(jobs).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("queued");
    expect(rows[0]?.claudeMode).toBe("sdk");
    sqlite.close();
  });

  it("再オープンしてもマイグレーションは一度だけ適用される", () => {
    const dbPath = path.join(tmpDir, "test.sqlite");
    const first = openDb(dbPath);
    first.sqlite.close();
    const second = openDb(dbPath);
    const version = second.sqlite.pragma("user_version", { simple: true });
    expect(version).toBeGreaterThanOrEqual(1);
    second.sqlite.close();
  });
});
