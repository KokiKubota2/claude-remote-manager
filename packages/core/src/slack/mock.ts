import type { PermissionRequest } from "../claude/adapter";
import type { JobRow } from "../db/schema";
import { getLogger } from "../logging/logger";
import type {
  PermissionAnswer,
  SlackActionHandlers,
  SlackBridge,
  SlackMessageRef,
} from "./bridge";

const log = getLogger("slack-mock");

export type MockPost = {
  type:
    | "job_started"
    | "job_completed"
    | "job_failed"
    | "job_cancelled"
    | "awaiting_decision"
    | "permission_request"
    | "permission_answered";
  jobId: string;
  detail?: unknown;
};

/**
 * Slack未設定時・テスト用のモック(§32)。
 * 投稿内容を記録し、テストからボタン操作をシミュレートできる。
 */
export class MockSlackBridge implements SlackBridge {
  readonly kind = "mock" as const;
  public posts: MockPost[] = [];
  public handlers: SlackActionHandlers | null = null;
  private tsCounter = 0;

  async start(handlers: SlackActionHandlers): Promise<void> {
    this.handlers = handlers;
    log.info("mock slack bridge started (Slack未設定のため通知はログのみ)");
  }

  async stop(): Promise<void> {}

  /** テスト用: 許可ボタン押下をシミュレート */
  async simulatePermissionAnswer(
    pendingActionId: string,
    answer: PermissionAnswer,
    userId = "U_MOCK",
  ): Promise<{ jobTitle: string }> {
    if (!this.handlers) throw new Error("not started");
    return this.handlers.onPermissionAnswer(pendingActionId, answer, userId);
  }

  /** テスト用: 追加指示Modal送信をシミュレート */
  async simulateInstruction(jobId: string, text: string, userId = "U_MOCK"): Promise<void> {
    if (!this.handlers) throw new Error("not started");
    return this.handlers.onInstruction(jobId, text, userId);
  }

  async postJobStarted(job: JobRow): Promise<void> {
    this.posts.push({ type: "job_started", jobId: job.id });
    log.info({ jobId: job.id }, "[mock slack] job started");
  }

  async postJobCompleted(job: JobRow, resultText: string): Promise<void> {
    this.posts.push({ type: "job_completed", jobId: job.id, detail: resultText });
    log.info({ jobId: job.id }, "[mock slack] job completed");
  }

  async postJobFailed(job: JobRow, error: string): Promise<void> {
    this.posts.push({ type: "job_failed", jobId: job.id, detail: error });
    log.info({ jobId: job.id, error }, "[mock slack] job failed");
  }

  async postJobCancelled(job: JobRow): Promise<void> {
    this.posts.push({ type: "job_cancelled", jobId: job.id });
  }

  async postAwaitingDecision(job: JobRow, latestMessage: string): Promise<void> {
    this.posts.push({ type: "awaiting_decision", jobId: job.id, detail: latestMessage });
  }

  async postPermissionRequest(
    pendingActionId: string,
    job: JobRow,
    request: PermissionRequest,
  ): Promise<SlackMessageRef | null> {
    this.posts.push({
      type: "permission_request",
      jobId: job.id,
      detail: { pendingActionId, toolName: request.toolName },
    });
    log.warn(
      { jobId: job.id, pendingActionId, tool: request.toolName },
      "[mock slack] permission request (Slack未設定のためWebから回答してください)",
    );
    this.tsCounter++;
    return { channelId: "C_MOCK", messageTs: `${this.tsCounter}.000` };
  }

  async updatePermissionAnswered(
    _ref: SlackMessageRef,
    job: JobRow,
    _request: PermissionRequest,
    answer: PermissionAnswer | "expired",
    _answeredBy: string | null,
  ): Promise<void> {
    this.posts.push({ type: "permission_answered", jobId: job.id, detail: answer });
  }
}
