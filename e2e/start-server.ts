import { spawn } from "node:child_process";
import { setupFixtures } from "./fixtures";

/**
 * PlaywrightのwebServerコマンド。
 * webServerはglobalSetupより先に起動されるため、
 * フィクスチャ生成をサーバー起動の直前にここで行う。
 */
setupFixtures();

const child = spawn("pnpm", ["--filter", "@claude-remote/web", "start"], {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 1));
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
