"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const IDLE_STATUSES = ["completed", "failed", "waiting_input"];

export function SendMessageForm({ jobId, status }: { jobId: string; status: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!IDLE_STATUSES.includes(status)) return null;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (res.ok) {
        setMessage("");
        router.refresh();
      } else {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "送信に失敗しました");
      }
    } catch {
      setError("接続に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-neutral-500">追加指示</h2>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        maxLength={4000}
        placeholder="例: 提案どおり進めてください / B案で進めてください"
        className="w-full rounded-xl border border-neutral-300 bg-white p-3.5 text-base dark:border-neutral-700 dark:bg-neutral-900"
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        onClick={submit}
        disabled={busy || message.trim().length === 0}
        className="rounded-xl bg-neutral-900 p-3.5 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
      >
        {busy ? "送信中…" : "Claudeへ送信"}
      </button>
    </section>
  );
}
