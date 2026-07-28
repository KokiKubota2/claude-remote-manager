"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ProjectOption = { id: string; name: string; defaultBranch: string };

const TEMPLATES: { label: string; task: string }[] = [
  {
    label: "エラー調査・修正",
    task: "以下のエラーを調査して修正してください。\n\n発生している問題:\n\n再現方法:\n\n期待する動作:\n",
  },
  { label: "テスト失敗修正", task: "失敗しているテストを調査し、原因を修正してください。" },
  { label: "コードレビュー", task: "最近の変更をレビューし、問題点と改善案をまとめてください。" },
  { label: "型エラー修正", task: "型チェックを実行し、型エラーをすべて修正してください。" },
  { label: "Lint修正", task: "Lintを実行し、エラーをすべて修正してください。" },
  { label: "自由入力", task: "" },
];

export function NewTaskForm({
  projects,
  initialProjectId,
}: {
  projects: ProjectOption[];
  initialProjectId: string | null;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(
    initialProjectId && projects.some((p) => p.id === initialProjectId)
      ? initialProjectId
      : (projects[0]?.id ?? ""),
  );
  const [task, setTask] = useState("");
  const [mode, setMode] = useState<"fix" | "investigate">("fix");
  const [runTests, setRunTests] = useState(true);
  const [createCommit, setCreateCommit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = projects.find((p) => p.id === projectId);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          task,
          mode,
          workspaceMode: "worktree",
          options: { runTests, allowDependencyInstall: false, createCommit },
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { job?: { id: string }; error?: string }
        | null;
      if (res.ok && body?.job) {
        router.replace(`/jobs/${body.job.id}`);
      } else {
        setError(body?.error ?? "作成に失敗しました");
      }
    } catch {
      setError("接続に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pb-28">
      <main className="flex flex-col gap-5 p-4">
        <section>
          <label className="mb-1 block text-sm font-semibold text-neutral-500">プロジェクト</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded-xl border border-neutral-300 bg-white p-3.5 text-base dark:border-neutral-700 dark:bg-neutral-900"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {selected && (
            <p className="mt-1 text-xs text-neutral-500">ベースブランチ: {selected.defaultBranch}</p>
          )}
        </section>

        <section>
          <label className="mb-1 block text-sm font-semibold text-neutral-500">テンプレート</label>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => setTask(t.task)}
                className="rounded-full border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <label className="mb-1 block text-sm font-semibold text-neutral-500">依頼内容</label>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={8}
            maxLength={4000}
            placeholder="Claude Codeへ依頼する内容を入力"
            className="w-full rounded-xl border border-neutral-300 bg-white p-3.5 text-base dark:border-neutral-700 dark:bg-neutral-900"
          />
        </section>

        <section className="flex flex-col gap-3">
          <label className="text-sm font-semibold text-neutral-500">実行モード</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("fix")}
              className={`flex-1 rounded-xl border p-3 text-sm font-medium ${
                mode === "fix"
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                  : "border-neutral-300 dark:border-neutral-700"
              }`}
            >
              修正まで行う
            </button>
            <button
              type="button"
              onClick={() => setMode("investigate")}
              className={`flex-1 rounded-xl border p-3 text-sm font-medium ${
                mode === "investigate"
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                  : "border-neutral-300 dark:border-neutral-700"
              }`}
            >
              調査のみ
            </button>
          </div>

          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={runTests}
              onChange={(e) => setRunTests(e.target.checked)}
              className="size-5"
            />
            関連テストを実行する
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={createCommit}
              onChange={(e) => setCreateCommit(e.target.checked)}
              className="size-5"
            />
            完了時にコミットを作成する
          </label>
        </section>

        {error && <p className="text-sm text-red-500">{error}</p>}
      </main>

      <div className="fixed inset-x-0 bottom-0 mx-auto flex max-w-lg gap-3 border-t border-neutral-200 bg-neutral-100/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 rounded-xl border border-neutral-300 p-4 text-base font-medium dark:border-neutral-700"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || !projectId || task.trim().length === 0}
          className="flex-[2] rounded-xl bg-neutral-900 p-4 text-base font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
        >
          {busy ? "作成中…" : "Claude Codeを開始"}
        </button>
      </div>
    </div>
  );
}
