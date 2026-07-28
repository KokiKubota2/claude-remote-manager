"use client";

import { useState } from "react";

type DiffFile = { path: string; additions: number; deletions: number };

function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <pre className="overflow-x-auto rounded-lg bg-neutral-950 p-3 text-xs leading-5 text-neutral-200">
      {lines.map((line, i) => {
        let cls = "";
        if (line.startsWith("+") && !line.startsWith("+++")) cls = "text-green-400";
        else if (line.startsWith("-") && !line.startsWith("---")) cls = "text-red-400";
        else if (line.startsWith("@@")) cls = "text-blue-400";
        return (
          <span key={i} className={`block ${cls}`}>
            {line || " "}
          </span>
        );
      })}
    </pre>
  );
}

export function DiffFileList({ jobId, files }: { jobId: string; files: DiffFile[] }) {
  const [open, setOpen] = useState<Record<string, string | "loading" | null>>({});

  async function toggle(path: string) {
    if (open[path]) {
      setOpen((s) => ({ ...s, [path]: null }));
      return;
    }
    setOpen((s) => ({ ...s, [path]: "loading" }));
    try {
      const res = await fetch(`/api/jobs/${jobId}/diff?file=${encodeURIComponent(path)}`);
      const body = (await res.json()) as { diff?: string; error?: string };
      setOpen((s) => ({ ...s, [path]: body.diff ?? `取得エラー: ${body.error ?? ""}` }));
    } catch {
      setOpen((s) => ({ ...s, [path]: "取得に失敗しました" }));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {files.map((f) => (
        <div
          key={f.path}
          className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
        >
          <button
            onClick={() => toggle(f.path)}
            className="flex w-full items-center justify-between gap-2 p-3.5 text-left"
          >
            <span className="break-all font-mono text-xs">{f.path}</span>
            <span className="shrink-0 text-xs">
              <span className="text-green-600">+{f.additions}</span>{" "}
              <span className="text-red-600">-{f.deletions}</span>
            </span>
          </button>
          {open[f.path] === "loading" && (
            <p className="px-3.5 pb-3 text-xs text-neutral-500">読み込み中…</p>
          )}
          {open[f.path] && open[f.path] !== "loading" && (
            <div className="px-2 pb-2">
              <DiffView diff={open[f.path] as string} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
