import { NextResponse, type NextRequest } from "next/server";
import { getJob, listJobEvents } from "@claude-remote/core";
import { requireAuthApi } from "@/lib/server/auth";
import { services } from "@/lib/server/services";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const unauthorized = requireAuthApi(request);
  if (unauthorized) return unauthorized;
  const { jobId } = await params;
  const { db } = services();
  const job = getJob(db, jobId);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ job, events: listJobEvents(db, jobId, 100) });
}
