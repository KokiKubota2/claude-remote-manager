import { getLogger } from "../logging/logger";

const log = getLogger("slack-outbox");

export type OutboxItem = { blocks: Record<string, unknown>[]; text: string };

/**
 * Slack切断時の未送信通知キュー(§21.1)。
 * 送信失敗した通知を保持し、定期的に再送する。
 * 許可要求(時間依存)には使わない — ジョブライフサイクル通知専用。
 */
export class NotificationOutbox {
  private queue: OutboxItem[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(
    private readonly send: (item: OutboxItem) => Promise<void>,
    private readonly opts: { maxQueue?: number; retryIntervalMs?: number } = {},
  ) {}

  get size(): number {
    return this.queue.length;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), this.opts.retryIntervalMs ?? 30_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** 送信を試み、失敗したらキューへ積む */
  async post(item: OutboxItem): Promise<void> {
    try {
      await this.send(item);
    } catch (e) {
      const max = this.opts.maxQueue ?? 50;
      this.queue.push(item);
      if (this.queue.length > max) {
        const dropped = this.queue.length - max;
        this.queue.splice(0, dropped);
        log.warn({ dropped }, "outbox overflow: oldest notifications dropped");
      }
      log.warn(
        { queued: this.queue.length, err: (e as Error).message },
        "slack post failed, queued for retry",
      );
    }
  }

  /** キューを順序どおり再送する。失敗したらそこで止めて次回に回す */
  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;
    try {
      while (this.queue.length > 0) {
        const item = this.queue[0]!;
        try {
          await this.send(item);
          this.queue.shift();
        } catch {
          return; // 依然として送信不可。次のタイマーで再試行
        }
      }
      log.info("slack outbox flushed");
    } finally {
      this.flushing = false;
    }
  }
}
