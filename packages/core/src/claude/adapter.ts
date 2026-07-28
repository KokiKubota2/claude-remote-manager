/**
 * Claude Codeとの接続を抽象化するアダプタ(§8.4)。
 * 主経路はAgent SDK。テストはMockClaudeAdapterを使う。
 */

export type PermissionSuggestion = unknown;

export type PermissionRequest = {
  toolName: string;
  input: Record<string, unknown>;
  /** SDKが描画した許可プロンプト文(あれば優先して表示する) */
  title?: string;
  displayName?: string;
  decisionReason?: string;
  suggestions?: PermissionSuggestion[];
};

export type PermissionDecision =
  | { behavior: "allow"; updatedInput?: Record<string, unknown> }
  | { behavior: "deny"; message: string; interrupt?: boolean };

/** 許可要求に回答する関数。Phase 6でSlack連携のPermissionBrokerが実装する */
export type PermissionHandler = (
  request: PermissionRequest,
  signal: AbortSignal,
) => Promise<PermissionDecision>;

export type ClaudeTurnEvent =
  | { type: "session_started"; sessionId: string }
  | { type: "assistant_message"; text: string }
  | { type: "permission_requested"; request: PermissionRequest }
  | { type: "permission_answered"; request: PermissionRequest; decision: PermissionDecision };

export type ClaudeTurnResult = {
  sessionId: string;
  isError: boolean;
  resultText: string;
  numTurns: number;
  totalCostUsd: number;
  permissionDenialCount: number;
};

export type StartTurnOptions = {
  prompt: string;
  cwd: string;
  /** ジョブ作成時に採番したUUID。新規セッションのIDとして事前指定する */
  sessionId: string;
  /** trueなら既存セッションを再開する(sessionIdをresumeに使う) */
  resume?: boolean;
  env?: Record<string, string>;
  onEvent?: (event: ClaudeTurnEvent) => void;
  onPermissionRequest: PermissionHandler;
  abortSignal?: AbortSignal;
};

export type ClaudeTurnHandle = {
  /** ターン完了(resultメッセージ)まで待つ */
  result: Promise<ClaudeTurnResult>;
  /** 実行中のターンを中断する */
  interrupt: () => Promise<void>;
};

export interface ClaudeAdapter {
  readonly kind: "sdk" | "mock";
  startTurn(options: StartTurnOptions): ClaudeTurnHandle;
}

export class ClaudeAdapterError extends Error {}
