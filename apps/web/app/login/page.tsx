"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
      } else {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "認証に失敗しました");
      }
    } catch {
      setError("接続に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Claude Remote</h1>
        <p className="mt-1 text-sm text-neutral-500">管理用トークンでログイン</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <input
          type="password"
          inputMode="text"
          autoComplete="current-password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="WEB_AUTH_TOKEN"
          className="rounded-xl border border-neutral-300 bg-white p-4 text-base dark:border-neutral-700 dark:bg-neutral-900"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={busy || token.length === 0}
          className="rounded-xl bg-neutral-900 p-4 text-base font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
        >
          {busy ? "確認中…" : "ログイン"}
        </button>
      </form>
    </main>
  );
}
