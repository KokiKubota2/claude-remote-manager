import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { NavBar } from "@/components/NavBar";
import { requireAuthPage } from "@/lib/server/auth";
import { listSessionsForView } from "@/lib/server/local-sessions";

export const dynamic = "force-dynamic";

function shortenPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+\//, "~/");
}

function elapsed(startedAtMs: number): string {
  const min = Math.floor((Date.now() - startedAtMs) / 60_000);
  if (min < 1) return "1分未満";
  if (min < 60) return `${min}分`;
  return `${Math.floor(min / 60)}時間${min % 60}分`;
}

export default async function SessionsPage() {
  await requireAuthPage();
  const sessions = await listSessionsForView();

  return (
    <div>
      <NavBar title="ローカルセッション" backHref="/" />
      <main className="flex flex-col gap-3 p-4">
        <AutoRefresh intervalMs={5000} />
        <p className="text-xs text-neutral-500">
          このMac上で実行中のClaude Codeセッション(ターミナル起動を含む)。表示は読み取り専用です。
          操作するにはターミナル、または <code>claude remote-control</code> を使ってください。
        </p>
        {sessions.length === 0 && (
          <p className="text-sm text-neutral-500">実行中のセッションはありません</p>
        )}
        {sessions.map((s) => (
          <div
            key={`${s.pid}-${s.sessionId}`}
            className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{s.name ?? s.sessionId.slice(0, 8)}</span>
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  s.status === "busy"
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {s.status === "busy" ? "実行中" : "入力待ち"}
              </span>
            </div>
            <p className="mt-1 break-all font-mono text-xs text-neutral-500">
              {shortenPath(s.cwd)}
            </p>
            <p className="mt-0.5 text-xs text-neutral-400">
              {s.kind === "background" ? "バックグラウンド" : "ターミナル"} ・ 起動から
              {elapsed(s.startedAt)}
            </p>
            {s.managedJobId && (
              <Link
                href={`/jobs/${s.managedJobId}`}
                className="mt-2 inline-block text-sm text-blue-600 underline dark:text-blue-400"
              >
                管理ジョブ {s.managedJobId} を開く
              </Link>
            )}
            {s.lastMessage && (
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap rounded-lg bg-neutral-100 p-3 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                {s.lastMessage.slice(0, 500)}
              </p>
            )}
            {!s.lastMessage && !s.managedJobId && (
              <p className="mt-2 text-xs text-neutral-400">(メッセージ記録なし)</p>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
