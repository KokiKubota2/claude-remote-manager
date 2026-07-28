import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { jobEvents, jobs, type JobRow } from "../db/schema";
import {
  canTransition,
  type CreateJobInput,
  type JobEventType,
  type JobStatus,
  type Project,
} from "../types/index";

/** 実行が終了していない(=リソースを持ちうる)状態 */
export const ACTIVE_JOB_STATUSES: JobStatus[] = [
  "queued",
  "preparing",
  "starting",
  "running",
  "waiting_permission",
  "waiting_input",
  "cancel_requested",
];

export class JobStateError extends Error {}

function nowIso(): string {
  return new Date().toISOString();
}

/** job_YYYYMMDD_NNN 形式のIDを採番する(§11.1) */
export function generateJobId(db: Db, now: Date = new Date()): string {
  const ymd = now.toISOString().slice(0, 10).replaceAll("-", "");
  const prefix = `job_${ymd}_`;
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(jobs)
    .where(like(jobs.id, `${prefix}%`))
    .get();
  const seq = (row?.count ?? 0) + 1;
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

export function jobTitleOf(input: CreateJobInput): string {
  if (input.title && input.title.trim()) return input.title.trim().slice(0, 120);
  const firstLine = input.task.split("\n").find((l) => l.trim()) ?? "";
  return firstLine.trim().slice(0, 60) || "(無題タスク)";
}

export function createJob(db: Db, project: Project, input: CreateJobInput): JobRow {
  const id = generateJobId(db);
  const now = nowIso();
  const row = {
    id,
    projectId: project.id,
    title: jobTitleOf(input),
    task: input.task,
    mode: input.mode,
    workspaceMode: input.workspaceMode,
    optionsJson: JSON.stringify(input.options),
    status: "queued" as const,
    baseBranch: input.baseBranch ?? project.defaultBranch,
    claudeMode: "sdk" as const,
    claudeSessionId: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  db.insert(jobs).values(row).run();
  appendJobEvent(db, id, "created", { input });
  return db.select().from(jobs).where(eq(jobs.id, id)).get() as JobRow;
}

export function getJob(db: Db, jobId: string): JobRow | null {
  return db.select().from(jobs).where(eq(jobs.id, jobId)).get() ?? null;
}

export function listJobs(
  db: Db,
  opts: { projectId?: string; statuses?: JobStatus[]; limit?: number } = {},
): JobRow[] {
  const conditions = [];
  if (opts.projectId) conditions.push(eq(jobs.projectId, opts.projectId));
  if (opts.statuses && opts.statuses.length > 0) conditions.push(inArray(jobs.status, opts.statuses));
  return db
    .select()
    .from(jobs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(jobs.createdAt))
    .limit(opts.limit ?? 100)
    .all();
}

export function countActiveJobs(db: Db, projectId?: string): number {
  const conditions = [inArray(jobs.status, ACTIVE_JOB_STATUSES)];
  if (projectId) conditions.push(eq(jobs.projectId, projectId));
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(jobs)
    .where(and(...conditions))
    .get();
  return row?.count ?? 0;
}

/**
 * 状態遷移を canTransition で検証しつつ更新する(§12)。
 * 不正遷移は JobStateError。
 */
export function transitionJob(
  db: Db,
  jobId: string,
  to: JobStatus,
  patch: Partial<
    Pick<
      JobRow,
      | "worktreePath"
      | "worktreeBranch"
      | "processId"
      | "processStartedAt"
      | "resultSummary"
      | "errorMessage"
      | "startedAt"
      | "completedAt"
    >
  > = {},
): JobRow {
  const job = getJob(db, jobId);
  if (!job) throw new JobStateError(`Job not found: ${jobId}`);
  const from = job.status as JobStatus;
  if (!canTransition(from, to)) {
    throw new JobStateError(`Invalid transition: ${from} -> ${to} (${jobId})`);
  }
  db.update(jobs)
    .set({ ...patch, status: to, updatedAt: nowIso() })
    .where(eq(jobs.id, jobId))
    .run();
  return getJob(db, jobId) as JobRow;
}

export function appendJobEvent(
  db: Db,
  jobId: string,
  type: JobEventType,
  payload: unknown = {},
): void {
  db.insert(jobEvents)
    .values({
      id: randomUUID(),
      jobId,
      type,
      payloadJson: JSON.stringify(payload),
      createdAt: nowIso(),
    })
    .run();
}

export function listJobEvents(db: Db, jobId: string, limit = 200) {
  return db
    .select()
    .from(jobEvents)
    .where(eq(jobEvents.jobId, jobId))
    .orderBy(desc(jobEvents.createdAt))
    .limit(limit)
    .all();
}
