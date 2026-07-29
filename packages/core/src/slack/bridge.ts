import type { JobRow } from "../db/schema";
import type { PermissionRequest } from "../claude/adapter";

export type SlackMessageRef = { channelId: string; messageTs: string };

export type PermissionAnswer = "allow_once" | "deny";

/** ボタン・Modal操作を受けるハンドラ群。Job Manager側(web)が登録する */
export type SlackActionHandlers = {
  /** 許可/拒否ボタン。二重回答なら既に回答済みの旨をthrowする */
  onPermissionAnswer: (
    pendingActionId: string,
    answer: PermissionAnswer,
    slackUserId: string,
  ) => Promise<{ jobTitle: string }>;
  /** 詳細ボタン。表示用テキストを返す */
  onPermissionDetails: (pendingActionId: string) => Promise<string>;
  /** 追加指示Modal送信 */
  onInstruction: (jobId: string, text: string, slackUserId: string) => Promise<void>;
  /** 停止ボタン */
  onStop: (jobId: string, slackUserId: string) => Promise<void>;
};

/**
 * Slack連携の抽象化(§8.5)。
 * 実装: SocketModeSlackBridge(本物) / MockSlackBridge(テスト・未設定時)
 */
export interface SlackBridge {
  readonly kind: "socket" | "mock";
  start(handlers: SlackActionHandlers): Promise<void>;
  stop(): Promise<void>;

  postJobStarted(job: JobRow): Promise<void>;
  postJobCompleted(job: JobRow, resultText: string): Promise<void>;
  postJobFailed(job: JobRow, error: string): Promise<void>;
  postJobCancelled(job: JobRow): Promise<void>;
  /** 応答終了(完了か質問待ちか不明)通知(§16.2) */
  postAwaitingDecision(job: JobRow, latestMessage: string): Promise<void>;

  /** ローカルセッション(ターミナル起動)が入力待ちになった通知 */
  postLocalSessionIdle(
    session: { name: string; cwd: string },
    lastMessage: string | null,
  ): Promise<void>;

  /** 許可要求を通知しメッセージ参照を返す(§15.3) */
  postPermissionRequest(
    pendingActionId: string,
    job: JobRow,
    request: PermissionRequest,
    expiresAtIso: string | null,
  ): Promise<SlackMessageRef | null>;
  /** 回答済みにメッセージを更新する */
  updatePermissionAnswered(
    ref: SlackMessageRef,
    job: JobRow,
    request: PermissionRequest,
    answer: PermissionAnswer | "expired",
    answeredBy: string | null,
  ): Promise<void>;
}
