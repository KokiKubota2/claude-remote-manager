import { NextResponse, type NextRequest } from "next/server";
import { detectDangerousCommand, getJob, listPendingActions, redactSecrets } from "@claude-remote/core";
import { requireAuthApi } from "@/lib/server/auth";
import { services } from "@/lib/server/services";

/** 未回答の許可要求一覧(CLI・Web共用) */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const unauthorized = requireAuthApi(request);
  if (unauthorized) return unauthorized;
  const { jobId } = await params;
  const { db } = services();

  if (!getJob(db, jobId)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const pending = listPendingActions(db, jobId)
    .filter((a) => a.type === "permission")
    .map((a) => {
      let toolName = "?";
      let commandText = "";
      try {
        const req = JSON.parse(a.requestJson) as {
          toolName?: string;
          input?: Record<string, unknown>;
        };
        toolName = req.toolName ?? "?";
        commandText =
          typeof req.input?.command === "string" ? req.input.command : JSON.stringify(req.input);
      } catch {
        commandText = "(解析できませんでした)";
      }
      return {
        id: a.id,
        toolName,
        commandText: redactSecrets(commandText).slice(0, 1000),
        warnings: detectDangerousCommand(commandText),
        createdAt: a.createdAt,
      };
    });

  return NextResponse.json({ pending });
}
