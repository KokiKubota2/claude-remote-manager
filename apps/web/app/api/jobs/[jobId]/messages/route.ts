import { NextResponse, type NextRequest } from "next/server";
import { getJob } from "@claude-remote/core";
import { requireAuthApi } from "@/lib/server/auth";
import { jobManager } from "@/lib/server/job-manager";
import { services } from "@/lib/server/services";

/** 追加指示の送信(§17)。アイドル状態のジョブをresumeで再開する */
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

  let message = "";
  try {
    const body = (await request.json()) as { message?: string };
    message = (body.message ?? "").trim();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  if (!message || message.length > 4000) {
    return NextResponse.json({ error: "1〜4000文字で入力してください" }, { status: 400 });
  }

  // 実行は非同期で継続する。状態検証エラーは即座にrejectされるため短時間だけ待って拾う。
  // レース後のrejectもthenで処理済みのためunhandled rejectionにはならない。
  const outcome = await Promise.race<{ accepted: boolean; error?: string }>([
    jobManager()
      .sendMessage(jobId, message)
      .then(
        () => ({ accepted: true }),
        (e: Error) => ({ accepted: false, error: e.message }),
      ),
    new Promise<{ accepted: boolean }>((r) => setTimeout(() => r({ accepted: true }), 300)),
  ]);

  if (!outcome.accepted) {
    return NextResponse.json({ error: outcome.error ?? "送信に失敗しました" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, job: getJob(db, jobId) });
}
