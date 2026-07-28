import "server-only";
import {
  JobManager,
  MockClaudeAdapter,
  SdkClaudeAdapter,
  getLogger,
  type ClaudeAdapter,
  type PermissionHandler,
} from "@claude-remote/core";
import { services } from "./services";
import { buildSlackHandlers, slackBridge, startSlackBridge } from "./slack";

const log = getLogger("web-job-manager");

const globalStore = globalThis as unknown as { __crmJobManager?: JobManager };

/**
 * 許可要求のデフォルトハンドラ。
 * Phase 6でSlack連携のPermissionBrokerに置き換わる。
 * それまでは自動許可せず、必ず拒否する(§16.1 自動許可しない)。
 */
const denyByDefault: PermissionHandler = async (request) => ({
  behavior: "deny",
  message:
    `リモート許可フローが未接続のため「${request.toolName}」の実行を拒否しました。` +
    "許可が不要な方法で続行するか、要約して終了してください。",
});

export function jobManager(): JobManager {
  if (!globalStore.__crmJobManager) {
    const { db, env, registry, worktrees } = services();
    const adapter: ClaudeAdapter =
      env.CLAUDE_ADAPTER === "mock"
        ? new MockClaudeAdapter()
        : new SdkClaudeAdapter(env.CLAUDE_JOB_MODEL ? { model: env.CLAUDE_JOB_MODEL } : {});
    const slack = slackBridge();
    const manager = new JobManager({
      db,
      registry,
      worktrees,
      adapter,
      permissionHandler: denyByDefault,
      maxConcurrentJobs: env.MAX_CONCURRENT_JOBS,
      maxConcurrentJobsPerProject: env.MAX_CONCURRENT_JOBS_PER_PROJECT,
      // ジョブのライフサイクルをSlackへ通知する(§15)
      onJobEvent: (event) => {
        void (async () => {
          switch (event.type) {
            case "job_started":
              await slack.postJobStarted(event.job);
              break;
            case "job_completed":
              await slack.postJobCompleted(event.job, event.resultText);
              break;
            case "job_failed":
              await slack.postJobFailed(event.job, event.error);
              break;
            case "job_cancelled":
              await slack.postJobCancelled(event.job);
              break;
            default:
              break;
          }
        })().catch((e) => log.error({ err: (e as Error).message }, "slack notify failed"));
      },
    });
    manager.start();
    globalStore.__crmJobManager = manager;

    void startSlackBridge(
      buildSlackHandlers({
        sendMessage: (jobId, message) => manager.sendMessage(jobId, message),
        interrupt: (jobId) => manager.interruptIfActive(jobId),
      }),
    );
    log.info({ adapter: adapter.kind, slack: slack.kind }, "job manager initialized");
  }
  return globalStore.__crmJobManager;
}
