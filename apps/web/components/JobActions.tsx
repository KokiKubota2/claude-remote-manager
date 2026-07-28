"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const CANCELLABLE = [
  "queued",
  "preparing",
  "starting",
  "running",
  "waiting_permission",
  "waiting_input",
];

export function JobActions({ jobId, status }: { jobId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!CANCELLABLE.includes(status)) return null;

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "停止に失敗しました");
      }
      setConfirming(false);
      router.refresh();
    } catch {
      setError("接続に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      {error && <p className="text-sm text-red-500">{error}</p>}
      {confirming ? (
        <div className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
          <p className="text-sm text-red-800 dark:text-red-200">
            ジョブを停止しますか?worktreeは削除されません。
          </p>
          <div className="flex gap-2">
            <button
              onClick={cancel}
              disabled={busy}
              className="flex-1 rounded-lg bg-red-600 p-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "停止中…" : "停止を確定"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="flex-1 rounded-lg border border-neutral-300 p-3 text-sm font-medium dark:border-neutral-700"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="rounded-xl border border-red-300 p-3.5 text-sm font-semibold text-red-600 dark:border-red-800"
        >
          ジョブを停止
        </button>
      )}
    </section>
  );
}
