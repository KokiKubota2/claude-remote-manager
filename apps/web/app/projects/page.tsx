import Link from "next/link";
import { listJobs } from "@claude-remote/core";
import { NavBar } from "@/components/NavBar";
import { requireAuthPage } from "@/lib/server/auth";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  await requireAuthPage();
  const { db, registry } = services();
  const projects = registry.listEnabled();

  return (
    <div>
      <NavBar title="プロジェクト" backHref="/" />
      <main className="flex flex-col gap-3 p-4">
        {projects.length === 0 && (
          <p className="text-sm text-neutral-500">
            有効なプロジェクトがありません。config/projects.yaml を設定してください。
          </p>
        )}
        {projects.map((p) => {
          const lastJob = listJobs(db, { projectId: p.id, limit: 1 })[0];
          return (
            <div
              key={p.id}
              className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <p className="font-semibold">{p.name}</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                {p.defaultBranch}
                {lastJob ? ` ・ 最終実行 ${lastJob.createdAt.slice(0, 16).replace("T", " ")}` : ""}
              </p>
              <Link
                href={`/new?project=${encodeURIComponent(p.id)}`}
                className="mt-3 block rounded-lg border border-neutral-300 p-2.5 text-center text-sm font-medium dark:border-neutral-700"
              >
                タスクを開始
              </Link>
            </div>
          );
        })}
      </main>
    </div>
  );
}
