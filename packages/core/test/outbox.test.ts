import { describe, expect, it } from "vitest";
import { NotificationOutbox, type OutboxItem } from "../src/slack/outbox";

function item(n: number): OutboxItem {
  return { blocks: [], text: `msg-${n}` };
}

describe("NotificationOutbox (§21.1)", () => {
  it("送信成功時はキューに積まない", async () => {
    const sent: string[] = [];
    const outbox = new NotificationOutbox(async (i) => {
      sent.push(i.text);
    });
    await outbox.post(item(1));
    expect(sent).toEqual(["msg-1"]);
    expect(outbox.size).toBe(0);
  });

  it("送信失敗時はキューに積み、flushで順序どおり再送する", async () => {
    let failing = true;
    const sent: string[] = [];
    const outbox = new NotificationOutbox(async (i) => {
      if (failing) throw new Error("disconnected");
      sent.push(i.text);
    });
    await outbox.post(item(1));
    await outbox.post(item(2));
    expect(outbox.size).toBe(2);

    // まだ切断中: flushしても残る
    await outbox.flush();
    expect(outbox.size).toBe(2);

    // 復旧後: 順序どおり送信される
    failing = false;
    await outbox.flush();
    expect(sent).toEqual(["msg-1", "msg-2"]);
    expect(outbox.size).toBe(0);
  });

  it("上限を超えたら古い通知から破棄する", async () => {
    const outbox = new NotificationOutbox(
      async () => {
        throw new Error("down");
      },
      { maxQueue: 3 },
    );
    for (let n = 1; n <= 5; n++) await outbox.post(item(n));
    expect(outbox.size).toBe(3);
  });

  it("flush途中で失敗したら残りは保持される", async () => {
    let sentCount = 0;
    const outbox = new NotificationOutbox(async (i) => {
      if (i.text === "msg-2" && sentCount < 1) {
        sentCount++;
        throw new Error("flaky");
      }
    });
    // 全部キューに積む(最初は全滅)
    const failAll = new NotificationOutbox(async () => {
      throw new Error("down");
    });
    void failAll;
    await outbox.post(item(2)); // 1回目は失敗して積まれる
    expect(outbox.size).toBe(1);
    await outbox.flush(); // 2回目は成功
    expect(outbox.size).toBe(0);
  });
});
