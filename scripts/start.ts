import { spawn } from "node:child_process";
import path from "node:path";

/**
 * 本番起動エントリポイント。
 * バインドアドレス(-H/-p)は起動時に決まるため、.envをここで読み込んでから
 * Next.jsを起動する(instrumentationの読み込みではバインドに間に合わない)。
 */
const repoRoot = path.resolve(import.meta.dirname, "..");
try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // .envがなければ環境変数のみで起動する
}

const host = process.env.WEB_HOST ?? "127.0.0.1";
const port = process.env.WEB_PORT ?? "32146";

const child = spawn(
  "pnpm",
  ["--filter", "@claude-remote/web", "exec", "next", "start", "-H", host, "-p", port],
  { stdio: "inherit", env: process.env, cwd: repoRoot },
);
child.on("exit", (code) => process.exit(code ?? 1));
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
