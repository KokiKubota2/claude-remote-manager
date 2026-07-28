import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { pendingActions, type PendingActionRow } from "../db/schema";
import type { PendingActionType } from "../types/index";

export class PendingActionError extends Error {
  constructor(message: string) {
    super(message);
    // Next.jsのバンドル境界を跨ぐとinstanceofが効かないため、名前でも判定できるようにする
    this.name = "PendingActionError";
  }
}

export function isPendingActionError(e: unknown): boolean {
  return e instanceof PendingActionError || (e as Error | null)?.name === "PendingActionError";
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createPendingAction(
  db: Db,
  opts: {
    jobId: string;
    type: PendingActionType;
    request: unknown;
    expiresAt: string | null;
  },
): PendingActionRow {
  const id = `pa_${randomUUID()}`;
  db.insert(pendingActions)
    .values({
      id,
      jobId: opts.jobId,
      type: opts.type,
      status: "pending",
      requestJson: JSON.stringify(opts.request),
      createdAt: nowIso(),
      expiresAt: opts.expiresAt,
    })
    .run();
  return getPendingAction(db, id)!;
}

export function getPendingAction(db: Db, id: string): PendingActionRow | null {
  return db.select().from(pendingActions).where(eq(pendingActions.id, id)).get() ?? null;
}

export function setPendingActionSlackRef(
  db: Db,
  id: string,
  ref: { channelId: string; messageTs: string },
): void {
  db.update(pendingActions)
    .set({ slackChannelId: ref.channelId, slackMessageTs: ref.messageTs })
    .where(eq(pendingActions.id, id))
    .run();
}

/**
 * 回答を記録する。二重回答防止(§28.1):
 * status='pending'の行だけを条件付きUPDATEし、変更行数0なら回答済みとして拒否する。
 */
export function answerPendingAction(
  db: Db,
  id: string,
  status: "answered" | "expired" | "cancelled",
  response: unknown,
): PendingActionRow {
  const result = db
    .update(pendingActions)
    .set({
      status,
      responseJson: JSON.stringify(response),
      answeredAt: nowIso(),
    })
    .where(and(eq(pendingActions.id, id), eq(pendingActions.status, "pending")))
    .run();
  if (result.changes === 0) {
    const existing = getPendingAction(db, id);
    if (!existing) throw new PendingActionError(`許可要求が見つかりません: ${id}`);
    throw new PendingActionError(`この要求はすでに処理済みです(${existing.status})`);
  }
  return getPendingAction(db, id)!;
}

export function listPendingActions(db: Db, jobId?: string): PendingActionRow[] {
  const conditions = [eq(pendingActions.status, "pending")];
  if (jobId) conditions.push(eq(pendingActions.jobId, jobId));
  return db
    .select()
    .from(pendingActions)
    .where(and(...conditions))
    .all();
}
