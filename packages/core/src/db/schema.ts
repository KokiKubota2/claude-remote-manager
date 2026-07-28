import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),

    title: text("title").notNull(),
    task: text("task").notNull(),
    mode: text("mode").notNull(),
    workspaceMode: text("workspace_mode").notNull().default("worktree"),
    optionsJson: text("options_json").notNull().default("{}"),

    status: text("status").notNull(),

    baseBranch: text("base_branch").notNull(),
    worktreePath: text("worktree_path"),
    worktreeBranch: text("worktree_branch"),

    claudeMode: text("claude_mode").notNull().default("sdk"),
    claudeSessionId: text("claude_session_id").notNull(),
    processId: integer("process_id"),
    processStartedAt: text("process_started_at"),

    resultSummary: text("result_summary"),
    errorMessage: text("error_message"),

    createdAt: text("created_at").notNull(),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("idx_jobs_status").on(t.status), index("idx_jobs_project").on(t.projectId)],
);

export const jobEvents = sqliteTable(
  "job_events",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    type: text("type").notNull(),
    payloadJson: text("payload_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("idx_job_events_job").on(t.jobId)],
);

export const pendingActions = sqliteTable(
  "pending_actions",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    type: text("type").notNull(),
    status: text("status").notNull().default("pending"),
    requestJson: text("request_json").notNull(),
    responseJson: text("response_json"),

    slackChannelId: text("slack_channel_id"),
    slackMessageTs: text("slack_message_ts"),
    slackThreadTs: text("slack_thread_ts"),

    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at"),
    answeredAt: text("answered_at"),
  },
  (t) => [
    index("idx_pending_actions_job").on(t.jobId),
    index("idx_pending_actions_status").on(t.status),
  ],
);

export type JobRow = typeof jobs.$inferSelect;
export type NewJobRow = typeof jobs.$inferInsert;
export type JobEventRow = typeof jobEvents.$inferSelect;
export type PendingActionRow = typeof pendingActions.$inferSelect;
