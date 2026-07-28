import { App, LogLevel } from "@slack/bolt";
import type { PermissionRequest } from "../claude/adapter";
import type { SlackConfig } from "../config/env";
import type { JobRow } from "../db/schema";
import { getLogger } from "../logging/logger";
import {
  ACTION_IDS,
  awaitingDecisionBlocks,
  instructionModalView,
  jobCancelledBlocks,
  jobCompletedBlocks,
  jobFailedBlocks,
  jobStartedBlocks,
  permissionAnsweredBlocks,
  permissionRequestBlocks,
} from "./blocks";
import type {
  PermissionAnswer,
  SlackActionHandlers,
  SlackBridge,
  SlackMessageRef,
} from "./bridge";
import { isAuthorizedSlackAction, isAuthorizedSlackUserOnly } from "./guard";

const log = getLogger("slack-bridge");

/**
 * Socket Modeによる本実装(§8.5, §15)。
 * 公開HTTPエンドポイントは作らない。
 */
export class SocketModeSlackBridge implements SlackBridge {
  readonly kind = "socket" as const;
  private app: App;
  private handlers: SlackActionHandlers | null = null;

  constructor(
    private readonly config: SlackConfig,
    private readonly webBaseUrl: string | null,
  ) {
    this.app = new App({
      token: config.botToken,
      appToken: config.appToken,
      socketMode: true,
      logLevel: LogLevel.WARN,
    });
  }

  private guardConfig() {
    return { channelId: this.config.channelId, allowedUserIds: this.config.allowedUserIds };
  }

  async start(handlers: SlackActionHandlers): Promise<void> {
    this.handlers = handlers;

    // 許可・拒否ボタン
    for (const [actionId, answer] of [
      [ACTION_IDS.permissionAllowOnce, "allow_once"],
      [ACTION_IDS.permissionDeny, "deny"],
    ] as const) {
      this.app.action(actionId, async ({ ack, body, action, respond }) => {
        await ack();
        const userId = body.user?.id;
        const channelId = body.channel?.id;
        if (!isAuthorizedSlackAction(this.guardConfig(), userId, channelId)) {
          log.warn({ userId, channelId, actionId }, "unauthorized slack action rejected");
          return;
        }
        const pendingActionId = (action as { value?: string }).value ?? "";
        try {
          await this.handlers!.onPermissionAnswer(pendingActionId, answer as PermissionAnswer, userId!);
        } catch (e) {
          await respond({
            response_type: "ephemeral",
            replace_original: false,
            text: `処理できませんでした: ${(e as Error).message}`,
          });
        }
      });
    }

    // 詳細ボタン
    this.app.action(ACTION_IDS.permissionShowDetails, async ({ ack, body, action, respond }) => {
      await ack();
      const userId = body.user?.id;
      const channelId = body.channel?.id;
      if (!isAuthorizedSlackAction(this.guardConfig(), userId, channelId)) return;
      const pendingActionId = (action as { value?: string }).value ?? "";
      try {
        const details = await this.handlers!.onPermissionDetails(pendingActionId);
        await respond({ response_type: "ephemeral", replace_original: false, text: details });
      } catch (e) {
        await respond({
          response_type: "ephemeral",
          replace_original: false,
          text: `詳細を取得できませんでした: ${(e as Error).message}`,
        });
      }
    });

    // 停止ボタン
    this.app.action(ACTION_IDS.jobStop, async ({ ack, body, action, respond }) => {
      await ack();
      const userId = body.user?.id;
      const channelId = body.channel?.id;
      if (!isAuthorizedSlackAction(this.guardConfig(), userId, channelId)) return;
      const jobId = (action as { value?: string }).value ?? "";
      try {
        await this.handlers!.onStop(jobId, userId!);
        await respond({
          response_type: "ephemeral",
          replace_original: false,
          text: `ジョブ ${jobId} の停止を要求しました`,
        });
      } catch (e) {
        await respond({
          response_type: "ephemeral",
          replace_original: false,
          text: `停止できませんでした: ${(e as Error).message}`,
        });
      }
    });

    // 追加指示Modalを開く
    this.app.action(ACTION_IDS.openInstructionModal, async ({ ack, body, action, client }) => {
      await ack();
      const userId = body.user?.id;
      const channelId = body.channel?.id;
      if (!isAuthorizedSlackAction(this.guardConfig(), userId, channelId)) return;
      const jobId = (action as { value?: string }).value ?? "";
      const triggerId = (body as { trigger_id?: string }).trigger_id;
      if (!triggerId) return;
      await client.views.open({
        trigger_id: triggerId,
        view: instructionModalView(jobId) as never,
      });
    });

    // Modal送信
    this.app.view(ACTION_IDS.instructionModalSubmit, async ({ ack, body, view }) => {
      const userId = body.user?.id;
      if (!isAuthorizedSlackUserOnly(this.guardConfig(), userId)) {
        await ack({
          response_action: "errors",
          errors: { instruction_block: "権限がありません" },
        });
        return;
      }
      const jobId = view.private_metadata;
      const text =
        view.state.values.instruction_block?.instruction_input?.value?.trim() ?? "";
      if (!text) {
        await ack({
          response_action: "errors",
          errors: { instruction_block: "指示を入力してください" },
        });
        return;
      }
      await ack();
      try {
        await this.handlers!.onInstruction(jobId, text, userId!);
      } catch (e) {
        await this.postText(`⚠️ 追加指示を処理できませんでした: ${(e as Error).message}`);
      }
    });

    await this.app.start();
    log.info("slack socket mode connected");
  }

  async stop(): Promise<void> {
    await this.app.stop();
  }

  private async postBlocks(blocks: Record<string, unknown>[]): Promise<SlackMessageRef | null> {
    try {
      const res = await this.app.client.chat.postMessage({
        channel: this.config.channelId,
        blocks: blocks as never,
        text: "Claude Remote 通知",
      });
      return res.ts ? { channelId: this.config.channelId, messageTs: res.ts } : null;
    } catch (e) {
      log.error({ err: (e as Error).message }, "chat.postMessage failed");
      return null;
    }
  }

  private async postText(text: string): Promise<void> {
    try {
      await this.app.client.chat.postMessage({ channel: this.config.channelId, text });
    } catch (e) {
      log.error({ err: (e as Error).message }, "chat.postMessage failed");
    }
  }

  async postJobStarted(job: JobRow): Promise<void> {
    await this.postBlocks(jobStartedBlocks(job, this.webBaseUrl));
  }

  async postJobCompleted(job: JobRow, resultText: string): Promise<void> {
    await this.postBlocks(jobCompletedBlocks(job, resultText, this.webBaseUrl));
  }

  async postJobFailed(job: JobRow, error: string): Promise<void> {
    await this.postBlocks(jobFailedBlocks(job, error, this.webBaseUrl));
  }

  async postJobCancelled(job: JobRow): Promise<void> {
    await this.postBlocks(jobCancelledBlocks(job));
  }

  async postAwaitingDecision(job: JobRow, latestMessage: string): Promise<void> {
    await this.postBlocks(awaitingDecisionBlocks(job, latestMessage, this.webBaseUrl));
  }

  async postPermissionRequest(
    pendingActionId: string,
    job: JobRow,
    request: PermissionRequest,
  ): Promise<SlackMessageRef | null> {
    return this.postBlocks(permissionRequestBlocks(pendingActionId, job, request));
  }

  async updatePermissionAnswered(
    ref: SlackMessageRef,
    job: JobRow,
    request: PermissionRequest,
    answer: PermissionAnswer | "expired",
    answeredBy: string | null,
  ): Promise<void> {
    try {
      await this.app.client.chat.update({
        channel: ref.channelId,
        ts: ref.messageTs,
        blocks: permissionAnsweredBlocks(job, request, answer, answeredBy) as never,
        text: "実行許可(回答済み)",
      });
    } catch (e) {
      log.error({ err: (e as Error).message }, "chat.update failed");
    }
  }
}
