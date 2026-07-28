import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * LaunchAgentのインストール(§20, §27 Phase 7)。
 * caffeinate -dims 経由で `pnpm start` を常駐させる。
 */

const repoDir = path.resolve(import.meta.dirname, "..");
const nodeBinDir = path.dirname(process.execPath);
const pnpmPath = (() => {
  try {
    return execFileSync("which", ["pnpm"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error("pnpm not found in PATH");
  }
})();

const template = fs.readFileSync(
  path.join(repoDir, "launchd", "com.local.claude-remote.plist.template"),
  "utf8",
);
const plist = template
  .replaceAll("{{REPO_DIR}}", repoDir)
  .replaceAll("{{NODE_BIN_DIR}}", nodeBinDir)
  .replaceAll("{{PNPM_PATH}}", pnpmPath);

fs.mkdirSync(path.join(repoDir, "logs"), { recursive: true });
const target = path.join(os.homedir(), "Library", "LaunchAgents", "com.local.claude-remote.plist");
fs.writeFileSync(target, plist);
console.log(`installed: ${target}`);

try {
  execFileSync("launchctl", ["unload", target], { stdio: "ignore" });
} catch {
  // 未ロードなら無視
}
execFileSync("launchctl", ["load", target]);
console.log("loaded. status:");
try {
  console.log(execFileSync("launchctl", ["list", "com.local.claude-remote"], { encoding: "utf8" }));
} catch {
  console.log("(not running yet)");
}
console.log("アンインストール: pnpm tsx scripts/uninstall-launch-agent.ts");
