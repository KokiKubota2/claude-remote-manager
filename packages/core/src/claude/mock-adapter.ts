import type {
  ClaudeAdapter,
  ClaudeTurnHandle,
  ClaudeTurnResult,
  PermissionRequest,
  StartTurnOptions,
} from "./adapter";

export type MockScriptStep =
  | { type: "assistant"; text: string; delayMs?: number }
  | { type: "permission"; request: PermissionRequest; delayMs?: number }
  | { type: "result"; text: string; isError?: boolean; delayMs?: number };

/**
 * テスト・オフライン開発用のモック(§32)。
 * scriptFactoryはターンごと(プロンプトごと)にステップ列を返す。
 */
export class MockClaudeAdapter implements ClaudeAdapter {
  readonly kind = "mock" as const;
  public startedTurns: StartTurnOptions[] = [];

  constructor(
    private readonly scriptFactory: (options: StartTurnOptions) => MockScriptStep[] = () => [
      { type: "assistant", text: "モック実行です" },
      { type: "result", text: "モック完了" },
    ],
  ) {}

  startTurn(options: StartTurnOptions): ClaudeTurnHandle {
    this.startedTurns.push(options);
    let interrupted = false;

    const result = (async (): Promise<ClaudeTurnResult> => {
      options.onEvent?.({ type: "session_started", sessionId: options.sessionId });
      let lastText = "";
      let denials = 0;
      for (const step of this.scriptFactory(options)) {
        if (step.delayMs) await sleep(step.delayMs);
        if (interrupted) {
          return {
            sessionId: options.sessionId,
            isError: true,
            resultText: "(中断されました)",
            numTurns: 0,
            totalCostUsd: 0,
            permissionDenialCount: denials,
          };
        }
        if (step.type === "assistant") {
          lastText = step.text;
          options.onEvent?.({ type: "assistant_message", text: step.text });
        } else if (step.type === "permission") {
          options.onEvent?.({ type: "permission_requested", request: step.request });
          const decision = await options.onPermissionRequest(
            step.request,
            AbortSignal.timeout(60_000),
          );
          options.onEvent?.({ type: "permission_answered", request: step.request, decision });
          if (decision.behavior === "deny") {
            denials++;
            if (decision.interrupt) {
              return {
                sessionId: options.sessionId,
                isError: true,
                resultText: decision.message,
                numTurns: 1,
                totalCostUsd: 0,
                permissionDenialCount: denials,
              };
            }
          }
        } else {
          return {
            sessionId: options.sessionId,
            isError: step.isError ?? false,
            resultText: step.text,
            numTurns: 1,
            totalCostUsd: 0,
            permissionDenialCount: denials,
          };
        }
      }
      return {
        sessionId: options.sessionId,
        isError: false,
        resultText: lastText || "モック完了",
        numTurns: 1,
        totalCostUsd: 0,
        permissionDenialCount: denials,
      };
    })();

    return {
      result,
      interrupt: async () => {
        interrupted = true;
      },
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
