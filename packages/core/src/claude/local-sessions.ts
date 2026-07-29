import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";
import { z } from "zod";
import { getLogger } from "../logging/logger";
import { transcriptPathOf } from "./transcript";

const execFileAsync = promisify(execFile);
const log = getLogger("local-sessions");

/**
 * ターミナル等から起動されたローカルClaude Codeセッションの監視(読み取り専用)。
 * 一覧は `claude agents --json`(実測: pid/cwd/kind/startedAt/sessionId/name/status)、
 * 内容はトランスクリプトJSONLの末尾から取得する。
 */

const sessionSchema = z.object({
  pid: z.number(),
  cwd: z.string(),
  kind: z.string(),
  startedAt: z.number(),
  sessionId: z.string(),
  name: z.string().optional(),
  status: z.string(),
});

export type LocalSession = z.infer<typeof sessionSchema>;

export async function listLocalSessions(
  claudeCommand = "claude",
  runner: (cmd: string, args: string[]) => Promise<string> = async (cmd, args) =>
    (await execFileAsync(cmd, args, { timeout: 15_000, maxBuffer: 4 * 1024 * 1024 })).stdout,
): Promise<LocalSession[]> {
  let raw: string;
  try {
    raw = await runner(claudeCommand, ["agents", "--json"]);
  } catch (e) {
    log.warn({ err: (e as Error).message }, "claude agents --json failed");
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown[];
    return parsed
      .map((item) => sessionSchema.safeParse(item))
      .filter((r): r is { success: true; data: LocalSession } => r.success)
      .map((r) => r.data);
  } catch {
    log.warn("claude agents --json returned unparsable output");
    return [];
  }
}

/** トランスクリプト末尾から最後のassistantテキストを取り出す(サブエージェント行は除外) */
export function latestAssistantText(
  cwd: string,
  sessionId: string,
  tailBytes = 256 * 1024,
): string | null {
  const transcriptPath = transcriptPathOf(cwd, sessionId);
  let tail: string;
  let truncatedHead = false;
  try {
    const stat = fs.statSync(transcriptPath);
    const start = Math.max(0, stat.size - tailBytes);
    truncatedHead = start > 0;
    const fd = fs.openSync(transcriptPath, "r");
    try {
      const buffer = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      tail = buffer.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null; // トランスクリプトなし(保存無効の子セッション等)
  }

  const lines = tail.split("\n");
  // 途中から読んだ場合のみ、先頭の欠けた行を捨てる
  if (truncatedHead && lines.length > 1) lines.shift();
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line) continue;
    let entry: {
      type?: string;
      isSidechain?: boolean;
      message?: { content?: Array<{ type?: string; text?: string }> };
    };
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type !== "assistant" || entry.isSidechain) continue;
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    const text = content
      .filter((b) => b?.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return null;
}

export type SessionIdleEvent = { session: LocalSession; lastMessage: string | null };

/**
 * busy→idle遷移の検知(「手が空いた/入力待ち」通知用)。
 * 初回観測時は通知しない。管理下ジョブ(isManaged)は除外する。
 */
export class LocalSessionWatcher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastStatus = new Map<string, string>();
  private polling = false;

  constructor(
    private readonly deps: {
      list: () => Promise<LocalSession[]>;
      isManaged: (sessionId: string) => boolean;
      onIdle: (event: SessionIdleEvent) => void;
    },
  ) {}

  start(intervalMs = 15_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const sessions = await this.deps.list();
      const seen = new Set<string>();
      for (const session of sessions) {
        seen.add(session.sessionId);
        const prev = this.lastStatus.get(session.sessionId);
        this.lastStatus.set(session.sessionId, session.status);
        if (
          prev === "busy" &&
          session.status === "idle" &&
          !this.deps.isManaged(session.sessionId)
        ) {
          this.deps.onIdle({
            session,
            lastMessage: latestAssistantText(session.cwd, session.sessionId),
          });
        }
      }
      // 終了したセッションの状態は破棄する
      for (const id of [...this.lastStatus.keys()]) {
        if (!seen.has(id)) this.lastStatus.delete(id);
      }
    } finally {
      this.polling = false;
    }
  }
}
