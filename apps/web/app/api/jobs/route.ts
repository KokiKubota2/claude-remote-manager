import { NextResponse, type NextRequest } from "next/server";
import {
  countActiveJobs,
  createJob,
  createJobInputSchema,
  listJobs,
} from "@claude-remote/core";
import { requireAuthApi } from "@/lib/server/auth";
import { services } from "@/lib/server/services";

export async function GET(request: NextRequest) {
  const unauthorized = requireAuthApi(request);
  if (unauthorized) return unauthorized;
  const { db } = services();
  const projectId = request.nextUrl.searchParams.get("project") ?? undefined;
  const jobs = listJobs(db, projectId ? { projectId } : {});
  return NextResponse.json({ jobs });
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAuthApi(request);
  if (unauthorized) return unauthorized;
  const { db, env, registry } = services();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const parsed = createJobInputSchema.safeParse(payload);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "入力内容を確認してください";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const input = parsed.data;

  // 登録済みリポジトリのみ許可(§19.3)
  const project = registry.get(input.projectId);
  if (!project) {
    return NextResponse.json({ error: "プロジェクトが見つかりません" }, { status: 404 });
  }

  // 同時実行制御(§18): 上限超過でも作成はする(queuedのまま待機)
  const activeForProject = countActiveJobs(db, project.id);
  if (activeForProject >= env.MAX_CONCURRENT_JOBS_PER_PROJECT + 5) {
    return NextResponse.json(
      { error: "このプロジェクトの待機ジョブが多すぎます。完了または停止してから作成してください" },
      { status: 429 },
    );
  }

  const job = createJob(db, project, input);
  return NextResponse.json({ job }, { status: 201 });
}
