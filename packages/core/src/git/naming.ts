import path from "node:path";

/** job_20260728_001 -> claude/job-20260728-001 (§11.1) */
export function worktreeBranchOf(jobId: string): string {
  if (!/^job_\d{8}_\d{3,}$/.test(jobId)) {
    throw new Error(`Unexpected job id format: ${jobId}`);
  }
  return `claude/${jobId.replaceAll("_", "-")}`;
}

/** ~/.claude-remote/worktrees/<projectId>/<job-20260728-001> (§11.1) */
export function worktreePathOf(worktreeRoot: string, projectId: string, jobId: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(projectId)) {
    throw new Error(`Unexpected project id format: ${projectId}`);
  }
  const dirName = jobId.replaceAll("_", "-").replace(/^job-/, "job-");
  return path.join(worktreeRoot, projectId, dirName);
}
