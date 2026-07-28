import os from "node:os";
import path from "node:path";
import { z } from "zod";

/** `~` 始まりのパスをホームディレクトリ展開したうえで絶対パス化する */
function expandPath(p: string): string {
  const expanded = p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p;
  return path.resolve(expanded);
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  WEB_HOST: z.string().default("127.0.0.1"),
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(32146),
  WEB_AUTH_TOKEN: z.string().min(32, "WEB_AUTH_TOKEN must be at least 32 characters"),

  DATABASE_PATH: z.string().default("./data/claude-remote.sqlite").transform(expandPath),

  SLACK_BOT_TOKEN: z.string().startsWith("xoxb-").optional().or(z.literal("").transform(() => undefined)),
  SLACK_APP_TOKEN: z.string().startsWith("xapp-").optional().or(z.literal("").transform(() => undefined)),
  SLACK_CHANNEL_ID: z.string().optional().or(z.literal("").transform(() => undefined)),
  ALLOWED_SLACK_USER_IDS: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    ),

  PROJECT_CONFIG_PATH: z.string().default("./config/projects.yaml").transform(expandPath),
  WORKTREE_ROOT: z.string().default("~/.claude-remote/worktrees").transform(expandPath),

  CLAUDE_COMMAND: z.string().default("claude"),
  GIT_COMMAND: z.string().default("git"),
  /** mock: Claude/Slackなしでの開発・E2E用 */
  CLAUDE_ADAPTER: z.enum(["sdk", "mock"]).default("sdk"),
  /** ジョブ実行に使うモデル(未指定はClaude Codeのデフォルト) */
  CLAUDE_JOB_MODEL: z.string().optional().or(z.literal("").transform(() => undefined)),

  MAX_CONCURRENT_JOBS: z.coerce.number().int().min(1).max(10).default(2),
  MAX_CONCURRENT_JOBS_PER_PROJECT: z.coerce.number().int().min(1).max(10).default(1),
  PERMISSION_TIMEOUT_SECONDS: z.coerce.number().int().min(10).default(3600),

  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

export type SlackConfig = {
  botToken: string;
  appToken: string;
  channelId: string;
  allowedUserIds: string[];
};

/** Slack設定が完全なら返す。未設定・不完全ならnull(モックアダプタで動作) */
export function slackConfigOf(env: Env): SlackConfig | null {
  if (!env.SLACK_BOT_TOKEN || !env.SLACK_APP_TOKEN || !env.SLACK_CHANNEL_ID) return null;
  return {
    botToken: env.SLACK_BOT_TOKEN,
    appToken: env.SLACK_APP_TOKEN,
    channelId: env.SLACK_CHANNEL_ID,
    allowedUserIds: env.ALLOWED_SLACK_USER_IDS,
  };
}

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}

let cached: Env | null = null;

/** プロセス内でキャッシュされた検証済み環境変数を返す */
export function getEnv(): Env {
  if (!cached) cached = parseEnv();
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}
