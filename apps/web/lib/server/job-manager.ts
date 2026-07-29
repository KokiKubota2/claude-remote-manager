import "server-only";
import {
  JobManager,
  MockClaudeAdapter,
  PermissionBroker,
  SdkClaudeAdapter,
  getLogger,
  type ClaudeAdapter,
} from "@claude-remote/core";
import { services } from "./services";
import { buildSlackHandlers, slackBridge, startSlackBridge } from "./slack";

const log = getLogger("web-job-manager");

const globalStore = globalThis as unknown as {
  __crmJobManager?: JobManager;
  __crmBroker?: PermissionBroker;
};

/** 許可要求の仲介(Slack/Web両方から回答できる)。jobManager()が初期化する */
export function permissionBroker(): PermissionBroker {
  if (!globalStore.__crmBroker) {
    const { db, env } = services();
    globalStore.__crmBroker = new PermissionBroker(
      db,
      slackBridge(),
      env.PERMISSION_TIMEOUT_SECONDS,
    );
  }
  return globalStore.__crmBroker;
}

export function jobManager(): JobManager {
  if (!globalStore.__crmJobManager) {
    const { db, env, registry, worktrees } = services();
    const adapter: ClaudeAdapter =
      env.CLAUDE_ADAPTER === "mock"
        ? new MockClaudeAdapter()
        : new SdkClaudeAdapter(env.CLAUDE_JOB_MODEL ? { model: env.CLAUDE_JOB_MODEL } : {});
    const slack = slackBridge();
    const broker = permissionBroker();
    const manager = new JobManager({
      db,
      registry,
      worktrees,
      adapter,
      permissionHandler: broker.handler,
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
        onPermissionAnswer: (id, answer, userId) => broker.answer(id, answer, userId),
        onPermissionDetails: (id) => broker.details(id),
      }),
    );
    // ローカルセッション(ターミナル起動)のidle通知
    void import("./local-sessions").then(({ startLocalSessionWatcher }) =>
      startLocalSessionWatcher(),
    );
    log.info({ adapter: adapter.kind, slack: slack.kind }, "job manager initialized");
  }
  return globalStore.__crmJobManager;
}
