import { NextResponse, type NextRequest } from "next/server";
import { appendJobEvent, getJob } from "@claude-remote/core";
import { requireAuthApi } from "@/lib/server/auth";
import { services } from "@/lib/server/services";

const TERMINAL_STATUSES = ["completed", "failed", "cancelled", "expired", "orphaned"];

/** worktree破棄(§11.4)。ブランチ保持はkeepBranchクエリで指定 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const unauthorized = requireAuthApi(request);
  if (unauthorized) return unauthorized;
  const { jobId } = await params;
  const { db, registry, worktrees } = services();

  const job = getJob(db, jobId);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!TERMINAL_STATUSES.includes(job.status)) {
    return NextResponse.json(
      { error: "実行中のジョブのworktreeは削除できません。先に停止してください" },
      { status: 409 },
    );
  }
  if (!job.worktreePath || !job.worktreeBranch) {
    return NextResponse.json({ error: "worktreeがありません" }, { status: 404 });
  }
  const project = registry.get(job.projectId);
  if (!project) return NextResponse.json({ error: "プロジェクトが見つかりません" }, { status: 404 });

  const keepBranch = request.nextUrl.searchParams.get("keepBranch") !== "false";
  try {
    await worktrees.removeWorktree({
      repoPath: project.repositoryPath,
      worktreePath: job.worktreePath,
      branch: job.worktreeBranch,
      keepBranch,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  appendJobEvent(db, jobId, "log", { message: `worktreeを削除しました(ブランチ${keepBranch ? "保持" : "削除"})` });
  return NextResponse.json({ ok: true, keepBranch });
}
