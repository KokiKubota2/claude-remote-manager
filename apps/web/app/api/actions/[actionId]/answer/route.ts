import { NextResponse, type NextRequest } from "next/server";
import { isPendingActionError } from "@claude-remote/core";
import { requireAuthApi } from "@/lib/server/auth";
import { permissionBroker } from "@/lib/server/job-manager";

/** Webからの許可回答(Slack障害時のフォールバック §21.2) */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ actionId: string }> },
) {
  const unauthorized = requireAuthApi(request);
  if (unauthorized) return unauthorized;
  const { actionId } = await params;

  let answer: "allow_once" | "deny";
  try {
    const body = (await request.json()) as { answer?: string };
    if (body.answer !== "allow_once" && body.answer !== "deny") {
      return NextResponse.json({ error: "answerはallow_once/denyのみです" }, { status: 400 });
    }
    answer = body.answer;
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  try {
    const result = await permissionBroker().answer(actionId, answer, "web");
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (isPendingActionError(e)) {
      return NextResponse.json({ error: (e as Error).message }, { status: 409 });
    }
    throw e;
  }
}
