export const JOB_STATUSES = [
  "queued",
  "preparing",
  "starting",
  "running",
  "waiting_permission",
  "waiting_input",
  "completed",
  "failed",
  "cancel_requested",
  "cancelled",
  "expired",
  "orphaned",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export type JobMode = "investigate" | "fix" | "review" | "test";

export type WorkspaceMode = "worktree" | "existing";

export type ClaudeMode = "sdk" | "process";

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun" | "unknown";

export type Project = {
  id: string;
  name: string;
  repositoryPath: string;
  defaultBranch: string;
  packageManager: PackageManager;
  enabled: boolean;
};

export type CreateJobInput = {
  projectId: string;
  task: string;
  title?: string;
  mode: JobMode;
  workspaceMode: WorkspaceMode;
  baseBranch?: string;
  options: {
    runTests: boolean;
    allowDependencyInstall: boolean;
    createCommit: boolean;
  };
};

export type JobEventType =
  | "created"
  | "started"
  | "log"
  | "permission_requested"
  | "permission_answered"
  | "input_requested"
  | "input_answered"
  | "completed"
  | "failed"
  | "cancelled";

export type PendingActionType = "permission" | "user_input" | "confirmation";

export type PendingActionStatus = "pending" | "answered" | "expired" | "cancelled";

/** 状態遷移の許可マップ(§12) */
export const JOB_STATUS_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  queued: ["preparing", "cancelled", "failed"],
  preparing: ["starting", "failed", "cancelled"],
  starting: ["running", "failed", "cancelled"],
  running: [
    "waiting_permission",
    "waiting_input",
    "completed",
    "failed",
    "cancel_requested",
    "orphaned",
  ],
  // waiting_permission -> waiting_input は再起動復旧時(回答先プロセスが消えたが再開可能な場合)
  waiting_permission: ["running", "waiting_input", "failed", "cancel_requested", "expired", "orphaned"],
  waiting_input: ["running", "failed", "cancel_requested", "expired", "orphaned"],
  cancel_requested: ["cancelled", "failed"],
  // completed/failedからrunningへは「追加指示」「再試行」でresumeする場合(§15.5, §15.6)
  completed: ["running"],
  failed: ["running"],
  cancelled: [],
  expired: [],
  orphaned: ["failed"],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return JOB_STATUS_TRANSITIONS[from].includes(to);
}
