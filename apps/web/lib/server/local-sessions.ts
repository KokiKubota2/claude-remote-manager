import "server-only";
import {
  LocalSessionWatcher,
  getJobBySessionId,
  latestAssistantText,
  listLocalSessions,
  redactSecrets,
  type LocalSession,
} from "@claude-remote/core";
import { services } from "./services";
import { slackBridge } from "./slack";

const globalStore = globalThis as unknown as { __crmSessionWatcher?: LocalSessionWatcher };

/** busy→idle遷移をSlackへ通知するwatcher(15秒間隔) */
export function startLocalSessionWatcher(): void {
  if (globalStore.__crmSessionWatcher) return;
  const { db, env } = services();
  const watcher = new LocalSessionWatcher({
    list: () => listLocalSessions(env.CLAUDE_COMMAND),
    isManaged: (sessionId) => getJobBySessionId(db, sessionId) !== null,
    onIdle: (event) => {
      void slackBridge()
        .postLocalSessionIdle(
          { name: event.session.name ?? event.session.sessionId, cwd: event.session.cwd },
          event.lastMessage ? redactSecrets(event.lastMessage) : null,
        )
        .catch(() => {
          // 送信失敗はoutboxが再送する
        });
    },
  });
  watcher.start();
  globalStore.__crmSessionWatcher = watcher;
}

export type LocalSessionView = LocalSession & {
  managedJobId: string | null;
  lastMessage: string | null;
  isSelf: boolean;
};

/** 監視ページ用: セッション一覧 + 最新メッセージ + 管理ジョブ紐づけ */
export async function listSessionsForView(): Promise<LocalSessionView[]> {
  const { db, env } = services();
  const sessions = await listLocalSessions(env.CLAUDE_COMMAND);
  return sessions
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((session) => {
      const managed = getJobBySessionId(db, session.sessionId);
      const last = latestAssistantText(session.cwd, session.sessionId);
      return {
        ...session,
        managedJobId: managed?.id ?? null,
        lastMessage: last ? redactSecrets(last) : null,
        isSelf: false,
      };
    });
}
