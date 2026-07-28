export type Migration = { name: string; sql: string };

export const MIGRATIONS: Migration[] = [
  {
    name: "0001_init",
    sql: `
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  task TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  worktree_path TEXT,
  worktree_branch TEXT,
  claude_mode TEXT NOT NULL DEFAULT 'sdk',
  claude_session_id TEXT NOT NULL,
  process_id INTEGER,
  process_started_at TEXT,
  result_summary TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_project ON jobs(project_id);

CREATE TABLE job_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_job_events_job ON job_events(job_id);

CREATE TABLE pending_actions (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  request_json TEXT NOT NULL,
  response_json TEXT,
  slack_channel_id TEXT,
  slack_message_ts TEXT,
  slack_thread_ts TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  answered_at TEXT
);
CREATE INDEX idx_pending_actions_job ON pending_actions(job_id);
CREATE INDEX idx_pending_actions_status ON pending_actions(status);
`,
  },
  {
    name: "0002_job_input_columns",
    sql: `
ALTER TABLE jobs ADD COLUMN workspace_mode TEXT NOT NULL DEFAULT 'worktree';
ALTER TABLE jobs ADD COLUMN options_json TEXT NOT NULL DEFAULT '{}';
`,
  },
];
