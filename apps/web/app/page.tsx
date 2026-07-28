import Link from "next/link";
import { listJobs } from "@claude-remote/core";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { NavBar } from "@/components/NavBar";
import { requireAuthPage } from "@/lib/server/auth";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

function JobCard({
  job,
}: {
  job: { id: string; title: string; status: string; projectId: string; createdAt: string };
}) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="block rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-neutral-500">{job.projectId}</span>
        <JobStatusBadge status={job.status} />
      </div>
      <p className="mt-1 font-medium">{job.title}</p>
    </Link>
  );
}

export default async function DashboardPage() {
  await requireAuthPage();
  const { db } = services();

  const active = listJobs(db, {
    statuses: ["preparing", "starting", "running", "cancel_requested"],
    limit: 10,
  });
  const waiting = listJobs(db, {
    statuses: ["waiting_permission", "waiting_input"],
    limit: 10,
  });
  const queued = listJobs(db, { statuses: ["queued"], limit: 10 });
  const recent = listJobs(db, {
    statuses: ["completed", "failed", "cancelled", "orphaned", "expired"],
    limit: 5,
  });

  return (
    <div className="pb-28">
      <NavBar title="Claude Remote" />
      <main className="flex flex-col gap-6 p-4">
        {waiting.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-amber-600">判断待ち</h2>
            <div className="flex flex-col gap-2">
              {waiting.map((j) => (
                <JobCard key={j.id} job={j} />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-sm font-semibold text-neutral-500">実行中</h2>
          {active.length === 0 ? (
            <p className="text-sm text-neutral-400">実行中のジョブはありません</p>
          ) : (
            <div className="flex flex-col gap-2">
              {active.map((j) => (
                <JobCard key={j.id} job={j} />
              ))}
            </div>
          )}
        </section>

        {queued.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-neutral-500">待機中</h2>
            <div className="flex flex-col gap-2">
              {queued.map((j) => (
                <JobCard key={j.id} job={j} />
              ))}
            </div>
          </section>
        )}

        {recent.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-neutral-500">最近の完了</h2>
            <div className="flex flex-col gap-2">
              {recent.map((j) => (
                <JobCard key={j.id} job={j} />
              ))}
            </div>
          </section>
        )}

        <nav className="flex gap-3 text-sm text-neutral-500">
          <Link href="/projects" className="underline">
            プロジェクト一覧
          </Link>
          <Link href="/jobs" className="underline">
            すべてのジョブ
          </Link>
        </nav>

        <p className="text-xs text-neutral-400">
          Mac状態: オンライン ・ 最終確認{" "}
          {new Date().toLocaleTimeString("ja-JP", { hour12: false })}
          (このページが表示できていればJob Managerは稼働中です)
        </p>
      </main>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-lg border-t border-neutral-200 bg-neutral-100/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <Link
          href="/new"
          className="block rounded-xl bg-neutral-900 p-4 text-center text-base font-semibold text-white dark:bg-white dark:text-neutral-900"
        >
          新しいタスク
        </Link>
      </div>
    </div>
  );
}
