import type {
  JobPermissionHandler,
  PermissionDecision,
  PermissionRequest,
} from "../claude/adapter";
import type { Db } from "../db/client";
import { getLogger } from "../logging/logger";
import { redactSecrets } from "../security/redaction";
import type { PermissionAnswer, SlackBridge, SlackMessageRef } from "../slack/bridge";
import { getJob } from "./repository";
import {
  PendingActionError,
  answerPendingAction,
  createPendingAction,
  getPendingAction,
  setPendingActionSlackRef,
} from "./pending-actions";

const log = getLogger("permission-broker");

type Waiter = {
  resolve: (decision: PermissionDecision) => void;
  request: PermissionRequest;
  jobId: string;
  slackRef: SlackMessageRef | null;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * 許可要求の仲介(§16.1)。
 *
 * canUseTool → PendingAction作成 → Slack通知 → 回答待ちPromise
 * 回答はSlackボタンまたはWeb APIから answer() で行う。
 * 期限切れ・プロセス中断時は自動許可せずdenyする。
 */
export class PermissionBroker {
  private waiters = new Map<string, Waiter>();

  constructor(
    private readonly db: Db,
    private readonly slack: SlackBridge,
    private readonly timeoutSeconds: number,
  ) {}

  /** JobManagerのpermissionHandlerへ渡すハンドラ */
  get handler(): JobPermissionHandler {
    return (jobId, request, signal) => this.requestForJob(jobId, request, signal);
  }

  async requestForJob(
    jobId: string,
    request: PermissionRequest,
    signal: AbortSignal,
  ): Promise<PermissionDecision> {
    const job = getJob(this.db, jobId);
    if (!job) return { behavior: "deny", message: "ジョブが見つかりません" };

    const expiresAt = new Date(Date.now() + this.timeoutSeconds * 1000).toISOString();
    const action = createPendingAction(this.db, {
      jobId,
      type: "permission",
      request,
      expiresAt,
    });

    const slackRef = await this.slack.postPermissionRequest(action.id, job, request, expiresAt);
    if (slackRef) setPendingActionSlackRef(this.db, action.id, slackRef);

    return new Promise<PermissionDecision>((resolve) => {
      const timer = setTimeout(() => {
        this.expire(action.id);
      }, this.timeoutSeconds * 1000);

      this.waiters.set(action.id, { resolve, request, jobId, slackRef, timer });

      // Claude側の中断(interrupt等)時は自動許可せずdenyで解決する
      signal.addEventListener(
        "abort",
        () => {
          this.finish(action.id, "cancelled", null, {
            behavior: "deny",
            message: "ジョブが中断されたため拒否しました",
          });
        },
        { once: true },
      );
    });
  }

  /**
   * Slackボタン・Web APIからの回答(§29 シナリオB)。
   * 二重回答はPendingActionErrorになる。
   */
  async answer(
    pendingActionId: string,
    answer: PermissionAnswer,
    answeredBy: string,
  ): Promise<{ jobTitle: string }> {
    const action = getPendingAction(this.db, pendingActionId);
    if (!action) throw new PendingActionError("許可要求が見つかりません");
    const decision: PermissionDecision =
      answer === "allow_once"
        ? { behavior: "allow" }
        : { behavior: "deny", message: "ユーザーが拒否しました" };

    // DB上の二重回答防止が先(waiterの有無に関わらず記録する)
    answerPendingAction(this.db, pendingActionId, "answered", { answer, answeredBy });
    this.finish(pendingActionId, null, answeredBy, decision, answer);

    const job = getJob(this.db, action.jobId);
    return { jobTitle: job?.title ?? action.jobId };
  }

  /** 詳細表示用テキスト(§15.3 [詳細]) */
  async details(pendingActionId: string): Promise<string> {
    const action = getPendingAction(this.db, pendingActionId);
    if (!action) throw new PendingActionError("許可要求が見つかりません");
    const job = getJob(this.db, action.jobId);
    const pretty = JSON.stringify(JSON.parse(action.requestJson), null, 2);
    return redactSecrets(
      [
        `ジョブ: ${job?.title ?? action.jobId} (${action.jobId})`,
        `状態: ${action.status}`,
        `要求内容:`,
        "```",
        pretty.slice(0, 2500),
        "```",
      ].join("\n"),
    );
  }

  private expire(pendingActionId: string): void {
    try {
      answerPendingAction(this.db, pendingActionId, "expired", { reason: "timeout" });
    } catch {
      return; // すでに回答済み
    }
    log.warn({ pendingActionId }, "permission request expired -> deny");
    this.finish(
      pendingActionId,
      null,
      null,
      {
        behavior: "deny",
        message: `${this.timeoutSeconds}秒以内に回答がなかったため拒否しました。必要なら追加指示で再実行してください`,
      },
      "expired",
    );
  }

  /** waiterを解決しSlackメッセージを更新する */
  private finish(
    pendingActionId: string,
    markStatus: "cancelled" | null,
    answeredBy: string | null,
    decision: PermissionDecision,
    slackLabel?: PermissionAnswer | "expired",
  ): void {
    const waiter = this.waiters.get(pendingActionId);
    if (!waiter) return;
    this.waiters.delete(pendingActionId);
    clearTimeout(waiter.timer);

    if (markStatus) {
      try {
        answerPendingAction(this.db, pendingActionId, markStatus, { reason: markStatus });
      } catch {
        // すでに回答済みなら無視
      }
    }

    if (waiter.slackRef && slackLabel) {
      const job = getJob(this.db, waiter.jobId);
      if (job) {
        void this.slack
          .updatePermissionAnswered(waiter.slackRef, job, waiter.request, slackLabel, answeredBy)
          .catch((e) => log.error({ err: (e as Error).message }, "slack update failed"));
      }
    }

    waiter.resolve(decision);
  }
}
