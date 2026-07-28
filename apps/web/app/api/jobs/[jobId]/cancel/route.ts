import { NextResponse, type NextRequest } from "next/server";
import { appendJobEvent, getJob, isJobStateError, transitionJob } from "@claude-remote/core";
import { requireAuthApi } from "@/lib/server/auth";
import { jobManager } from "@/lib/server/job-manager";
import { services } from "@/lib/server/services";

/**
 * ジョブ停止(§29 シナリオE)。
 * - queued/preparing/starting: 即cancelled
 * - running系: cancel_requestedにし、実行中ターンをinterruptする
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const unauthorized = requireAuthApi(request);
  if (unauthorized) return unauthorized;
  const { jobId } = await params;
  const { db } = services();

  const job = getJob(db, jobId);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    let updated;
    if (["queued", "preparing", "starting"].includes(job.status)) {
      updated = transitionJob(db, jobId, "cancelled", {
        completedAt: new Date().toISOString(),
      });
      appendJobEvent(db, jobId, "cancelled", { via: "web", from: job.status });
    } else if (["running", "waiting_permission", "waiting_input"].includes(job.status)) {
      updated = transitionJob(db, jobId, "cancel_requested");
      appendJobEvent(db, jobId, "cancelled", { via: "web", from: job.status, requested: true });
      void jobManager().interruptIfActive(jobId);
    } else {
      return NextResponse.json({ error: `停止できない状態です: ${job.status}` }, { status: 409 });
    }
    return NextResponse.json({ job: updated });
  } catch (e) {
    if (isJobStateError(e)) {
      return NextResponse.json({ error: (e as Error).message }, { status: 409 });
    }
    throw e;
  }
}
