import { NavBar } from "@/components/NavBar";
import { NewTaskForm } from "@/components/NewTaskForm";
import { requireAuthPage } from "@/lib/server/auth";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  await requireAuthPage();
  const { registry } = services();
  const { project } = await searchParams;
  const projects = registry.listEnabled().map((p) => ({
    id: p.id,
    name: p.name,
    defaultBranch: p.defaultBranch,
  }));

  return (
    <div>
      <NavBar title="新しいタスク" backHref="/" />
      <NewTaskForm projects={projects} initialProjectId={project ?? null} />
    </div>
  );
}
