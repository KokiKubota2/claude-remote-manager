"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type PendingPermission = {
  id: string;
  toolName: string;
  commandText: string;
  warnings: string[];
};

export function PermissionPrompt({ pending }: { pending: PendingPermission[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (pending.length === 0) return null;

  async function respond(id: string, answer: "allow_once" | "deny") {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/actions/${id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "回答に失敗しました");
      }
      router.refresh();
    } catch {
      setError("接続に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-amber-600">🔐 実行許可が必要です</h2>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {pending.map((p) => (
        <div
          key={p.id}
          className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950"
        >
          <p className="text-sm font-semibold">{p.toolName}</p>
          <pre className="overflow-x-auto rounded-lg bg-neutral-950 p-3 text-xs text-neutral-200">
            {p.commandText}
          </pre>
          {p.warnings.length > 0 && (
            <p className="text-xs text-red-600 dark:text-red-400">
              ⚠️ {p.warnings.join(" / ")}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => respond(p.id, "allow_once")}
              disabled={busy !== null}
              className="flex-1 rounded-lg bg-neutral-900 p-3 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
            >
              今回のみ許可
            </button>
            <button
              onClick={() => respond(p.id, "deny")}
              disabled={busy !== null}
              className="flex-1 rounded-lg border border-red-400 p-3 text-sm font-semibold text-red-600 disabled:opacity-40"
            >
              拒否
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
