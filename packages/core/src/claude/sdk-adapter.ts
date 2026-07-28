import { query, type Options, type PermissionResult, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { getLogger } from "../logging/logger";
import type {
  ClaudeAdapter,
  ClaudeTurnHandle,
  ClaudeTurnResult,
  PermissionRequest,
  StartTurnOptions,
} from "./adapter";

const log = getLogger("sdk-adapter");

/**
 * Claude Agent SDKによる実装(capability-report §13.2)。
 * 1ターン = 1 query() 実行。継続はresume+同一sessionIdで行う。
 */
export class SdkClaudeAdapter implements ClaudeAdapter {
  readonly kind = "sdk" as const;

  constructor(
    private readonly opts: {
      /** claude実行ファイル(未指定はSDK同梱の解決に任せる) */
      pathToClaudeCodeExecutable?: string;
      model?: string;
    } = {},
  ) {}

  startTurn(options: StartTurnOptions): ClaudeTurnHandle {
    const sdkOptions: Options = {
      cwd: options.cwd,
      // 許可判断は必ずcanUseToolへ流す
      permissionMode: "default",
      includePartialMessages: false,
      ...(options.env ? { env: options.env } : {}),
      ...(this.opts.pathToClaudeCodeExecutable
        ? { pathToClaudeCodeExecutable: this.opts.pathToClaudeCodeExecutable }
        : {}),
      ...(this.opts.model ? { model: this.opts.model } : {}),
      ...(options.resume
        ? { resume: options.sessionId }
        : { sessionId: options.sessionId }),
      ...(options.abortSignal ? { abortController: abortControllerFrom(options.abortSignal) } : {}),
      canUseTool: async (toolName, input, meta): Promise<PermissionResult> => {
        const request: PermissionRequest = {
          toolName,
          input,
          ...(meta.title !== undefined ? { title: meta.title } : {}),
          ...(meta.displayName !== undefined ? { displayName: meta.displayName } : {}),
          ...(meta.decisionReason !== undefined ? { decisionReason: meta.decisionReason } : {}),
          ...(meta.suggestions !== undefined ? { suggestions: meta.suggestions } : {}),
        };
        options.onEvent?.({ type: "permission_requested", request });
        const decision = await options.onPermissionRequest(request, meta.signal);
        options.onEvent?.({ type: "permission_answered", request, decision });
        if (decision.behavior === "allow") {
          return {
            behavior: "allow",
            updatedInput: decision.updatedInput ?? input,
          };
        }
        return {
          behavior: "deny",
          message: decision.message,
          ...(decision.interrupt !== undefined ? { interrupt: decision.interrupt } : {}),
        };
      },
    };

    const q = query({ prompt: options.prompt, options: sdkOptions });

    const result = (async (): Promise<ClaudeTurnResult> => {
      let sessionId = options.sessionId;
      let lastAssistantText = "";
      for await (const message of q as AsyncIterable<SDKMessage>) {
        switch (message.type) {
          case "system":
            if (message.subtype === "init") {
              sessionId = message.session_id;
              options.onEvent?.({ type: "session_started", sessionId });
            }
            break;
          case "assistant": {
            const blocks = (message.message.content ?? []) as unknown as Array<{
              type?: string;
              text?: string;
            }>;
            const text = blocks
              .filter((b) => b?.type === "text" && typeof b.text === "string")
              .map((b) => b.text as string)
              .join("\n");
            if (text.trim()) {
              lastAssistantText = text;
              options.onEvent?.({ type: "assistant_message", text });
            }
            break;
          }
          case "result": {
            const isError = message.is_error;
            const resultText =
              "result" in message && typeof message.result === "string" && message.result
                ? message.result
                : lastAssistantText;
            return {
              sessionId,
              isError,
              resultText,
              numTurns: message.num_turns,
              totalCostUsd: message.total_cost_usd,
              permissionDenialCount: message.permission_denials?.length ?? 0,
            };
          }
          default:
            break;
        }
      }
      // resultメッセージなしで終了した場合(中断など)
      log.warn({ sessionId }, "query ended without result message");
      return {
        sessionId,
        isError: true,
        resultText: lastAssistantText || "(結果を取得できませんでした)",
        numTurns: 0,
        totalCostUsd: 0,
        permissionDenialCount: 0,
      };
    })();

    return {
      result,
      interrupt: async () => {
        try {
          await q.interrupt();
        } catch (e) {
          log.warn({ err: (e as Error).message }, "interrupt failed");
        }
      },
    };
  }
}

function abortControllerFrom(signal: AbortSignal): AbortController {
  const controller = new AbortController();
  if (signal.aborted) controller.abort();
  else signal.addEventListener("abort", () => controller.abort(), { once: true });
  return controller;
}
