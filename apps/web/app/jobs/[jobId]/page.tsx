import { notFound } from "next/navigation";
import { getJob, listJobEvents } from "@claude-remote/core";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { NavBar } from "@/components/NavBar";
import { JobActions } from "@/components/JobActions";
import { requireAuthPage } from "@/lib/server/auth";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  await requireAuthPage();
  const { jobId } = await params;
  const { db } = services();
  const job = getJob(db, jobId);
  if (!job) notFound();

  const events = listJobEvents(db, jobId, 30);
  const latestMessage = events.find((e) => e.type === "log" || e.type === "completed");
  let latestText: string | null = null;
  if (job.resultSummary) {
    latestText = job.resultSummary;
  } else if (latestMessage) {
    try {
      const payload = JSON.parse(latestMessage.payloadJson) as { message?: string };
      latestText = payload.message ?? null;
    } catch {
      latestText = null;
    }
  }

  return (
    <div className="pb-8">
      <NavBar title={job.title} backHref="/" />
      <main className="flex flex-col gap-5 p-4">
        <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-500">{job.projectId}</span>
            <JobStatusBadge status={job.status} />
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-neutral-500">ジョブID</dt>
            <dd className="font-mono text-xs leading-5">{job.id}</dd>
            <dt className="text-neutral-500">ベース</dt>
            <dd>{job.baseBranch}</dd>
            {job.worktreeBranch && (
              <>
                <dt className="text-neutral-500">作業ブランチ</dt>
                <dd className="font-mono text-xs leading-5">{job.worktreeBranch}</dd>
              </>
            )}
            <dt className="text-neutral-500">作成</dt>
            <dd>{job.createdAt.slice(0, 19).replace("T", " ")}</dd>
          </dl>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-neutral-500">依頼内容</h2>
          <p className="whitespace-pre-wrap rounded-xl border border-neutral-200 bg-white p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900">
            {job.task}
          </p>
        </section>

        {latestText && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-neutral-500">Claudeからの最新メッセージ</h2>
            <p className="whitespace-pre-wrap rounded-xl border border-neutral-200 bg-white p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900">
              {latestText}
            </p>
          </section>
        )}

        {job.errorMessage && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-red-600">エラー</h2>
            <p className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {job.errorMessage}
            </p>
          </section>
        )}

        {job.worktreePath && (
          <a
            href={`/jobs/${job.id}/diff`}
            className="rounded-xl border border-neutral-300 p-3.5 text-center text-sm font-semibold dark:border-neutral-700"
          >
            Git差分を見る
          </a>
        )}

        <JobActions jobId={job.id} status={job.status} />

        <section>
          <h2 className="mb-2 text-sm font-semibold text-neutral-500">イベント</h2>
          <ul className="flex flex-col gap-1 text-xs text-neutral-500">
            {events.map((e) => (
              <li key={e.id} className="flex gap-2">
                <span className="shrink-0 font-mono">{e.createdAt.slice(11, 19)}</span>
                <span>{e.type}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
