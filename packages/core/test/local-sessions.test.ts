import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LocalSessionWatcher,
  latestAssistantText,
  listLocalSessions,
  type LocalSession,
} from "../src/claude/local-sessions";
import { transcriptPathOf } from "../src/claude/transcript";

const CWD = "/tmp/crm-local-session-test";
const SESSION_ID = "test-local-session-0001";

function writeTranscript(lines: unknown[]): string {
  const p = transcriptPathOf(CWD, SESSION_ID);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return p;
}

function assistantEntry(text: string, extra: Record<string, unknown> = {}): unknown {
  return {
    type: "assistant",
    message: { role: "assistant", content: [{ type: "text", text }] },
    ...extra,
  };
}

beforeEach(() => {
  fs.rmSync(path.dirname(transcriptPathOf(CWD, SESSION_ID)), { recursive: true, force: true });
});

afterEach(() => {
  fs.rmSync(path.dirname(transcriptPathOf(CWD, SESSION_ID)), { recursive: true, force: true });
});

describe("latestAssistantText", () => {
  it("最後のassistantテキストを返す", () => {
    writeTranscript([
      { type: "user", message: { content: [{ type: "text", text: "質問" }] } },
      assistantEntry("最初の返答"),
      assistantEntry("最後の返答"),
    ]);
    expect(latestAssistantText(CWD, SESSION_ID)).toBe("最後の返答");
  });

  it("tool_useのみの行とサブエージェント行は飛ばす", () => {
    writeTranscript([
      assistantEntry("本命の返答"),
      { type: "assistant", message: { content: [{ type: "tool_use", name: "Bash" }] } },
      assistantEntry("サブエージェントの返答", { isSidechain: true }),
    ]);
    expect(latestAssistantText(CWD, SESSION_ID)).toBe("本命の返答");
  });

  it("トランスクリプトがなければnull", () => {
    expect(latestAssistantText(CWD, "no-such-session")).toBeNull();
  });

  it("壊れた行が混ざっても動く", () => {
    const p = writeTranscript([assistantEntry("正常な返答")]);
    fs.appendFileSync(p, "not-json\n{broken\n");
    expect(latestAssistantText(CWD, SESSION_ID)).toBe("正常な返答");
  });
});

describe("listLocalSessions", () => {
  it("agents --jsonの出力をパースする", async () => {
    const fixture = JSON.stringify([
      {
        pid: 100,
        cwd: "/repo/a",
        kind: "interactive",
        startedAt: 1785215341498,
        sessionId: "s-1",
        name: "a-1",
        status: "busy",
      },
      { invalid: "row" },
    ]);
    const sessions = await listLocalSessions("claude", async () => fixture);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ sessionId: "s-1", status: "busy" });
  });

  it("コマンド失敗・不正出力では空配列", async () => {
    expect(
      await listLocalSessions("claude", async () => {
        throw new Error("no tty");
      }),
    ).toEqual([]);
    expect(await listLocalSessions("claude", async () => "garbage")).toEqual([]);
  });
});

describe("LocalSessionWatcher", () => {
  function session(id: string, status: string): LocalSession {
    return {
      pid: 1,
      cwd: CWD,
      kind: "interactive",
      startedAt: 0,
      sessionId: id,
      name: `name-${id}`,
      status,
    };
  }

  it("busy→idle遷移で通知する(初回観測では通知しない)", async () => {
    const idleEvents: string[] = [];
    let current = [session("s-1", "busy")];
    const watcher = new LocalSessionWatcher({
      list: async () => current,
      isManaged: () => false,
      onIdle: (e) => idleEvents.push(e.session.sessionId),
    });

    await watcher.poll(); // 初回: busy観測のみ
    expect(idleEvents).toEqual([]);
    current = [session("s-1", "idle")];
    await watcher.poll(); // busy→idle
    expect(idleEvents).toEqual(["s-1"]);
    await watcher.poll(); // idleのまま: 再通知しない
    expect(idleEvents).toEqual(["s-1"]);
  });

  it("初回からidleのセッションは通知しない", async () => {
    const idleEvents: string[] = [];
    const watcher = new LocalSessionWatcher({
      list: async () => [session("s-1", "idle")],
      isManaged: () => false,
      onIdle: (e) => idleEvents.push(e.session.sessionId),
    });
    await watcher.poll();
    await watcher.poll();
    expect(idleEvents).toEqual([]);
  });

  it("管理下ジョブのセッションは通知しない", async () => {
    const idleEvents: string[] = [];
    let current = [session("managed-1", "busy")];
    const watcher = new LocalSessionWatcher({
      list: async () => current,
      isManaged: (id) => id === "managed-1",
      onIdle: (e) => idleEvents.push(e.session.sessionId),
    });
    await watcher.poll();
    current = [session("managed-1", "idle")];
    await watcher.poll();
    expect(idleEvents).toEqual([]);
  });

  it("消えたセッションの状態は破棄され、再出現時は初回扱い", async () => {
    const idleEvents: string[] = [];
    let current = [session("s-1", "busy")];
    const watcher = new LocalSessionWatcher({
      list: async () => current,
      isManaged: () => false,
      onIdle: (e) => idleEvents.push(e.session.sessionId),
    });
    await watcher.poll();
    current = []; // セッション終了
    await watcher.poll();
    current = [session("s-1", "idle")]; // 別プロセスとして再出現
    await watcher.poll();
    expect(idleEvents).toEqual([]);
  });
});
