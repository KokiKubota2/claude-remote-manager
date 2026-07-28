import "server-only";
import type { JobRow } from "@claude-remote/core";
import { services } from "./services";

/** ジョブの差分比較に使うbase refを決める(origin優先) */
export async function baseRefOf(job: JobRow): Promise<string> {
  const { worktrees, registry } = services();
  const project = registry.get(job.projectId);
  if (project && (await worktrees.remoteBranchExists(project.repositoryPath, job.baseBranch))) {
    return `origin/${job.baseBranch}`;
  }
  return job.baseBranch;
}
