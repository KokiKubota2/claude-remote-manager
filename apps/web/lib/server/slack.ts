import "server-only";
import {
  MockSlackBridge,
  SocketModeSlackBridge,
  appendJobEvent,
  getJob,
  getLogger,
  slackConfigOf,
  transitionJob,
  type SlackActionHandlers,
  type SlackBridge,
} from "@claude-remote/core";
import { services } from "./services";

const log = getLogger("web-slack");

const globalStore = globalThis as unknown as {
  __crmSlack?: SlackBridge;
  __crmSlackStarted?: boolean;
};

export function slackBridge(): SlackBridge {
  if (!globalStore.__crmSlack) {
    const { env } = services();
    const config = slackConfigOf(env);
    globalStore.__crmSlack = config
      ? new SocketModeSlackBridge(config, env.WEB_BASE_URL ?? null)
      : new MockSlackBridge();
  }
  return globalStore.__crmSlack;
}

/**
 * Slackボタン・Modal操作のハンドラ。
 * 許可回答(onPermissionAnswer / onPermissionDetails)はPhase 6のPermissionBrokerが上書きする。
 */
export function buildSlackHandlers(deps: {
  sendMessage: (jobId: string, message: string) => Promise<void>;
  interrupt: (jobId: string) => Promise<boolean>;
  onPermissionAnswer?: SlackActionHandlers["onPermissionAnswer"];
  onPermissionDetails?: SlackActionHandlers["onPermissionDetails"];
}): SlackActionHandlers {
  const { db } = services();
  return {
    onPermissionAnswer:
      deps.onPermissionAnswer ??
      (async () => {
        throw new Error("許可フローが未接続です");
      }),
    onPermissionDetails:
      deps.onPermissionDetails ??
      (async () => {
        throw new Error("許可フローが未接続です");
      }),
    onInstruction: async (jobId, text, slackUserId) => {
      appendJobEvent(db, jobId, "input_requested", { via: "slack", slackUserId });
      await deps.sendMessage(jobId, text);
    },
    onStop: async (jobId, slackUserId) => {
      const job = getJob(db, jobId);
      if (!job) throw new Error("ジョブが見つかりません");
      if (["queued", "preparing", "starting"].includes(job.status)) {
        transitionJob(db, jobId, "cancelled", { completedAt: new Date().toISOString() });
        appendJobEvent(db, jobId, "cancelled", { via: "slack", slackUserId });
      } else if (["running", "waiting_permission", "waiting_input"].includes(job.status)) {
        transitionJob(db, jobId, "cancel_requested");
        appendJobEvent(db, jobId, "cancelled", { via: "slack", slackUserId, requested: true });
        await deps.interrupt(jobId);
      } else {
        throw new Error(`停止できない状態です: ${job.status}`);
      }
    },
  };
}

export async function startSlackBridge(handlers: SlackActionHandlers): Promise<void> {
  if (globalStore.__crmSlackStarted) return;
  globalStore.__crmSlackStarted = true;
  try {
    await slackBridge().start(handlers);
  } catch (e) {
    log.error({ err: (e as Error).message }, "slack bridge failed to start");
    globalStore.__crmSlackStarted = false;
  }
}
