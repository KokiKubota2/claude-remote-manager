import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2Eテスト(§28.3)。モバイル幅・mockアダプタ・専用ポートで実行する。
 * フィクスチャ(ダミーrepo・registry・DB)は e2e/global-setup.ts が用意する。
 */

export const E2E_PORT = 32198;
export const E2E_TOKEN = "e2e-test-token-0123456789abcdef0123456789abcdef";
export const E2E_TMP = path.join(import.meta.dirname, "e2e", ".tmp");

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1, // 共有SQLite・単一Job Managerのため直列実行
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${E2E_PORT}`,
    ...devices["iPhone 13"],
  },
  webServer: {
    command: `tsx e2e/start-server.ts`,
    url: `http://127.0.0.1:${E2E_PORT}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: "production",
      WEB_HOST: "127.0.0.1",
      WEB_PORT: String(E2E_PORT),
      WEB_AUTH_TOKEN: E2E_TOKEN,
      DATABASE_PATH: path.join(E2E_TMP, "e2e.sqlite"),
      PROJECT_CONFIG_PATH: path.join(E2E_TMP, "projects.yaml"),
      WORKTREE_ROOT: path.join(E2E_TMP, "worktrees"),
      CLAUDE_ADAPTER: "mock",
      PERMISSION_TIMEOUT_SECONDS: "60",
      LOG_LEVEL: "warn",
    },
  },
});
