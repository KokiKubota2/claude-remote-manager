import Link from "next/link";
import { listJobs } from "@claude-remote/core";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { NavBar } from "@/components/NavBar";
import { requireAuthPage } from "@/lib/server/auth";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  await requireAuthPage();
  const { db } = services();
  const jobs = listJobs(db, { limit: 50 });

  return (
    <div>
      <NavBar title="ジョブ一覧" backHref="/" />
      <main className="flex flex-col gap-2 p-4">
        {jobs.length === 0 && <p className="text-sm text-neutral-500">ジョブはまだありません</p>}
        {jobs.map((j) => (
          <Link
            key={j.id}
            href={`/jobs/${j.id}`}
            className="block rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-neutral-500">
                {j.projectId} ・ {j.createdAt.slice(0, 16).replace("T", " ")}
              </span>
              <JobStatusBadge status={j.status} />
            </div>
            <p className="mt-1 font-medium">{j.title}</p>
          </Link>
        ))}
      </main>
    </div>
  );
}
