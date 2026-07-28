import { NextResponse, type NextRequest } from "next/server";
import { appendJobEvent, getJob } from "@claude-remote/core";
import { requireAuthApi } from "@/lib/server/auth";
import { services } from "@/lib/server/services";

/** コミット作成(§11.4)。Job Manager側で行う方式 */
export async function POST(
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
    return NextResponse.json({ error: "worktreeがありません" }, { status: 404 });
  }

  let message = `claude: ${job.title}`;
  try {
    const body = (await request.json().catch(() => null)) as { message?: string } | null;
    if (body?.message && body.message.trim()) message = body.message.trim().slice(0, 200);
  } catch {
    // bodyなしでもよい
  }

  try {
    const sha = await worktrees.commitAll(job.worktreePath, message);
    appendJobEvent(db, jobId, "log", { message: `コミットを作成しました: ${sha.slice(0, 8)}` });
    return NextResponse.json({ ok: true, sha });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
