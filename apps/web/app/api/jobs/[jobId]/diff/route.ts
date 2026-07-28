import { NextResponse, type NextRequest } from "next/server";
import { getJob, redactSecrets } from "@claude-remote/core";
import { requireAuthApi } from "@/lib/server/auth";
import { baseRefOf } from "@/lib/server/diff";
import { services } from "@/lib/server/services";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const unauthorized = requireAuthApi(request);
  if (unauthorized) return unauthorized;
  const { jobId } = await params;
  const { db, worktrees } = services();

  const job = getJob(db, jobId);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!job.worktreePath) {
    return NextResponse.json({ files: [], totalAdditions: 0, totalDeletions: 0 });
  }

  const baseRef = await baseRefOf(job);
  const file = request.nextUrl.searchParams.get("file");
  try {
    if (file) {
      // 単一ファイルのunified diff。worktree外パスはWorktreeManagerが拒否する
      const diff = await worktrees.fileDiff(job.worktreePath, baseRef, file);
      return NextResponse.json({ file, diff: redactSecrets(diff) });
    }
    const summary = await worktrees.diffSummary(job.worktreePath, baseRef);
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
