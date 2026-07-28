import { inArray, sql } from "drizzle-orm";
import type {
  ClaudeAdapter,
  ClaudeTurnHandle,
  JobPermissionHandler,
} from "../claude/adapter";
import { sanitizeClaudeEnv } from "../claude/env";
import { buildTaskPrompt } from "../claude/prompt";
import { transcriptExists } from "../claude/transcript";
import type { ProjectRegistry } from "../config/projects";
import type { Db } from "../db/client";
import { jobs, type JobRow } from "../db/schema";
import type { WorktreeManager } from "../git/worktree";
import { getLogger } from "../logging/logger";
import type { CreateJobInput, JobStatus } from "../types/index";
import { answerPendingAction, listPendingActions } from "./pending-actions";
import {
  appendJobEvent,
  getJob,
  listJobs,
  pruneJobEvents,
  transitionJob,
} from "./repository";

const log = getLogger("job-manager");

/** 実行スロットを消費する(=起動済みの)状態 */
const RUNNING_STATUSES: JobStatus[] = [
  "preparing",
  "starting",
  "running",
  "waiting_permission",
  "waiting_input",
  "cancel_requested",
];

export type JobManagerDeps = {
  db: Db;
  registry: ProjectRegistry;
  worktrees: WorktreeManager;
  adapter: ClaudeAdapter;
  permissionHandler: JobPermissionHandler;
  maxConcurrentJobs: number;
  maxConcurrentJobsPerProject: number;
  /** ジョブの状態変化を通知する(Phase 5でSlack Bridgeが購読) */
  onJobEvent?: (event: JobLifecycleEvent) => void;
};

export type JobLifecycleEvent =
  | { type: "job_started"; job: JobRow }
  | { type: "job_completed"; job: JobRow; resultText: string }
  | { type: "job_failed"; job: JobRow; error: string }
  | { type: "job_cancelled"; job: JobRow }
  | { type: "job_message"; job: JobRow; text: string };

export class JobManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private activeTurns = new Map<string, ClaudeTurnHandle>();
  private ticking = false;

  constructor(private readonly deps: JobManagerDeps) {}

  start(intervalMs = 3000): void {
    if (this.timer) return;
    this.recoverOnStartup();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    log.info("job manager started");
  }

  /**
   * 再起動後の復旧(§21.4)。
   * 実行中扱いのままのジョブは対応プロセスが失われている。
   * トランスクリプトが残っていればresume可能として「判断待ち」へ、なければorphanedにする。
   */
  recoverOnStartup(): void {
    const { db, registry } = this.deps;
    const stale = listJobs(db, { statuses: RUNNING_STATUSES });
    for (const job of stale) {
      if (this.activeTurns.has(job.id)) continue;

      // 未回答の許可要求は失効させる(自動許可しない)
      for (const action of listPendingActions(db, job.id)) {
        try {
          answerPendingAction(db, action.id, "cancelled", { reason: "job manager restart" });
        } catch {
          // すでに処理済み
        }
      }

      const project = registry.get(job.projectId);
      const cwd = job.worktreePath ?? project?.repositoryPath ?? null;
      const resumable = cwd !== null && transcriptExists(cwd, job.claudeSessionId);

      try {
        if (job.status === "cancel_requested") {
          transitionJob(db, job.id, "cancelled", { completedAt: new Date().toISOString() });
          appendJobEvent(db, job.id, "cancelled", { via: "recovery" });
        } else if (["preparing", "starting"].includes(job.status)) {
          transitionJob(db, job.id, "failed", {
            errorMessage: "Job Manager再起動により起動前に中断されました。再作成してください",
            completedAt: new Date().toISOString(),
          });
          appendJobEvent(db, job.id, "failed", { via: "recovery" });
        } else if (resumable) {
          // running / waiting_permission / waiting_input -> waiting_input(追加指示で再開可能)
          if (job.status !== "waiting_input") {
            transitionJob(db, job.id, "waiting_input");
          }
          appendJobEvent(db, job.id, "log", {
            message:
              "Job Manager再起動により実行が中断されました。セッションは保存されているため、追加指示で再開できます",
          });
        } else {
          transitionJob(db, job.id, "orphaned", {
            errorMessage: "再起動後にプロセスもセッション記録も見つかりませんでした",
          });
          appendJobEvent(db, job.id, "failed", { via: "recovery", orphaned: true });
        }
        log.warn({ jobId: job.id, from: job.status, resumable }, "recovered stale job");
      } catch (e) {
        log.error({ jobId: job.id, err: (e as Error).message }, "recovery failed");
      }
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  isActive(jobId: string): boolean {
    return this.activeTurns.has(jobId);
  }

  private countRunning(projectId?: string): number {
    const rows = this.deps.db
      .select({ projectId: jobs.projectId, count: sql<number>`count(*)` })
      .from(jobs)
      .where(inArray(jobs.status, RUNNING_STATUSES))
      .groupBy(jobs.projectId)
      .all();
    if (projectId) return rows.find((r) => r.projectId === projectId)?.count ?? 0;
    return rows.reduce((s, r) => s + r.count, 0);
  }

  /** queuedジョブを容量の範囲で起動する(§18) */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const queued = listJobs(this.deps.db, { statuses: ["queued"] })
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      for (const job of queued) {
        if (this.countRunning() >= this.deps.maxConcurrentJobs) break;
        if (this.countRunning(job.projectId) >= this.deps.maxConcurrentJobsPerProject) continue;
        // claim: queued -> preparing(同期的に遷移するので二重起動しない)
        try {
          transitionJob(this.deps.db, job.id, "preparing");
        } catch {
          continue;
        }
        void this.runJob(job.id).catch((e) => {
          log.error({ jobId: job.id, err: (e as Error).message }, "runJob crashed");
        });
      }
    } finally {
      this.ticking = false;
    }
  }

  private inputOf(job: JobRow): CreateJobInput {
    let options: CreateJobInput["options"];
    try {
      options = JSON.parse(job.optionsJson) as CreateJobInput["options"];
    } catch {
      options = { runTests: true, allowDependencyInstall: false, createCommit: false };
    }
    return {
      projectId: job.projectId,
      task: job.task,
      title: job.title,
      mode: job.mode as CreateJobInput["mode"],
      workspaceMode: job.workspaceMode as CreateJobInput["workspaceMode"],
      baseBranch: job.baseBranch,
      options,
    };
  }

  private async runJob(jobId: string): Promise<void> {
    const { db, registry, worktrees } = this.deps;
    let job = getJob(db, jobId);
    if (!job) return;

    const project = registry.get(job.projectId);
    if (!project) {
      this.failJob(jobId, `プロジェクトが見つかりません: ${job.projectId}`);
      return;
    }

    // 1. worktree準備(§11)
    let cwd = project.repositoryPath;
    try {
      if (job.workspaceMode === "worktree" && !job.worktreePath) {
        const info = await worktrees.createJobWorktree({
          repoPath: project.repositoryPath,
          projectId: project.id,
          jobId: job.id,
          baseBranch: job.baseBranch,
        });
        cwd = info.worktreePath;
        job = transitionJob(db, jobId, "starting", {
          worktreePath: info.worktreePath,
          worktreeBranch: info.branch,
        });
      } else {
        if (job.worktreePath) cwd = job.worktreePath;
        job = transitionJob(db, jobId, "starting");
      }
    } catch (e) {
      this.failJob(jobId, `worktree作成に失敗しました: ${(e as Error).message}`);
      return;
    }

    // 2. Claude起動
    const prompt = buildTaskPrompt(project, this.inputOf(job));
    await this.executeTurn(jobId, cwd, prompt, false);
  }

  /**
   * 1ターン実行する共通処理。resume=trueなら既存セッションの再開。
   */
  private async executeTurn(
    jobId: string,
    cwd: string,
    prompt: string,
    resume: boolean,
  ): Promise<void> {
    const { db, adapter } = this.deps;
    const job = getJob(db, jobId);
    if (!job) return;

    const handle = adapter.startTurn({
      prompt,
      cwd,
      sessionId: job.claudeSessionId,
      resume,
      env: sanitizeClaudeEnv(process.env, { CLAUDE_REMOTE_JOB_ID: job.id }),
      onPermissionRequest: async (request, signal) => {
        // 許可待ちへ遷移(§16.1)
        this.safeTransition(jobId, "waiting_permission");
        appendJobEvent(db, jobId, "permission_requested", { request });
        try {
          const decision = await this.deps.permissionHandler(jobId, request, signal);
          appendJobEvent(db, jobId, "permission_answered", { request, decision });
          return decision;
        } finally {
          this.safeTransition(jobId, "running");
        }
      },
      onEvent: (event) => {
        if (event.type === "session_started") {
          this.safeTransition(jobId, "running", { startedAt: new Date().toISOString() });
          const started = getJob(db, jobId);
          if (started) this.deps.onJobEvent?.({ type: "job_started", job: started });
        } else if (event.type === "assistant_message") {
          appendJobEvent(db, jobId, "log", { message: event.text });
          const current = getJob(db, jobId);
          if (current) this.deps.onJobEvent?.({ type: "job_message", job: current, text: event.text });
        }
      },
    });
    this.activeTurns.set(jobId, handle);

    try {
      const result = await handle.result;
      const finished = getJob(db, jobId);
      if (!finished) return;

      if (finished.status === "cancel_requested") {
        const cancelled = transitionJob(db, jobId, "cancelled", {
          completedAt: new Date().toISOString(),
        });
        appendJobEvent(db, jobId, "cancelled", {});
        this.deps.onJobEvent?.({ type: "job_cancelled", job: cancelled });
        return;
      }

      if (result.isError) {
        this.failJob(jobId, result.resultText);
        return;
      }

      const completed = transitionJob(db, jobId, "completed", {
        resultSummary: result.resultText,
        completedAt: new Date().toISOString(),
      });
      appendJobEvent(db, jobId, "completed", {
        numTurns: result.numTurns,
        totalCostUsd: result.totalCostUsd,
      });
      pruneJobEvents(db, jobId);
      this.deps.onJobEvent?.({ type: "job_completed", job: completed, resultText: result.resultText });
    } catch (e) {
      this.failJob(jobId, (e as Error).message);
    } finally {
      this.activeTurns.delete(jobId);
    }
  }

  /**
   * 追加指示を送る(§17)。
   * アイドル状態(completed/failed/waiting_input)のジョブをresumeで再開する。
   */
  async sendMessage(jobId: string, message: string): Promise<void> {
    const { db, registry } = this.deps;
    const job = getJob(db, jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    if (this.activeTurns.has(jobId)) {
      throw new Error("ジョブが実行中です。完了を待ってから追加指示を送ってください");
    }
    if (!["completed", "failed", "waiting_input"].includes(job.status)) {
      throw new Error(`追加指示を送れない状態です: ${job.status}`);
    }
    const project = registry.get(job.projectId);
    if (!project) throw new Error(`プロジェクトが見つかりません: ${job.projectId}`);

    const cwd = job.worktreePath ?? project.repositoryPath;
    transitionJob(db, jobId, "running");
    appendJobEvent(db, jobId, "input_answered", { message });
    await this.executeTurn(jobId, cwd, message, true);
  }

  /** 実行中ターンを中断する(§29 シナリオE)。DB側はcancel_requested前提 */
  async interruptIfActive(jobId: string): Promise<boolean> {
    const handle = this.activeTurns.get(jobId);
    if (!handle) return false;
    await handle.interrupt();
    return true;
  }

  private failJob(jobId: string, error: string): void {
    try {
      const failed = transitionJob(this.deps.db, jobId, "failed", {
        errorMessage: error,
        completedAt: new Date().toISOString(),
      });
      appendJobEvent(this.deps.db, jobId, "failed", { error });
      this.deps.onJobEvent?.({ type: "job_failed", job: failed, error });
    } catch (e) {
      log.error({ jobId, err: (e as Error).message }, "failJob transition error");
    }
  }

  private safeTransition(
    jobId: string,
    to: JobStatus,
    patch: Parameters<typeof transitionJob>[3] = {},
  ): void {
    try {
      transitionJob(this.deps.db, jobId, to, patch);
    } catch {
      // 既に目的の状態、またはcancel_requested等で遷移不可の場合は無視
    }
  }
}
