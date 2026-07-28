import { notFound } from "next/navigation";
import { getJob, redactSecrets } from "@claude-remote/core";
import { NavBar } from "@/components/NavBar";
import { requireAuthPage } from "@/lib/server/auth";
import { baseRefOf } from "@/lib/server/diff";
import { services } from "@/lib/server/services";
import { DiffFileList } from "@/components/DiffFileList";

export const dynamic = "force-dynamic";

export default async function JobDiffPage({ params }: { params: Promise<{ jobId: string }> }) {
  await requireAuthPage();
  const { jobId } = await params;
  const { db, worktrees } = services();
  const job = getJob(db, jobId);
  if (!job) notFound();

  if (!job.worktreePath) {
    return (
      <div>
        <NavBar title="Git差分" backHref={`/jobs/${jobId}`} />
        <main className="p-4 text-sm text-neutral-500">worktreeがまだ作成されていません。</main>
      </div>
    );
  }

  let files: { path: string; additions: number; deletions: number; binary: boolean }[] = [];
  let error: string | null = null;
  let totals = { additions: 0, deletions: 0 };
  try {
    const baseRef = await baseRefOf(job);
    const summary = await worktrees.diffSummary(job.worktreePath, baseRef);
    files = summary.files.filter((f) => !f.binary);
    totals = { additions: summary.totalAdditions, deletions: summary.totalDeletions };
  } catch (e) {
    error = redactSecrets((e as Error).message);
  }

  return (
    <div>
      <NavBar title="Git差分" backHref={`/jobs/${jobId}`} />
      <main className="flex flex-col gap-3 p-4">
        {error && <p className="text-sm text-red-500">{error}</p>}
        {!error && files.length === 0 && (
          <p className="text-sm text-neutral-500">変更はありません。</p>
        )}
        {files.length > 0 && (
          <>
            <p className="text-sm text-neutral-500">
              {files.length}ファイル ・ <span className="text-green-600">+{totals.additions}</span>{" "}
              / <span className="text-red-600">-{totals.deletions}</span>
            </p>
            <DiffFileList jobId={jobId} files={files} />
          </>
        )}
      </main>
    </div>
  );
}
