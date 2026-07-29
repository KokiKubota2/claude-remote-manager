import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseEnv, slackConfigOf } from "../packages/core/src/config/env";

// リポジトリ直下の .env を読み込む(すでに設定済みの環境変数は上書きしない)
try {
  process.loadEnvFile(path.join(import.meta.dirname, "..", ".env"));
} catch {
  // .env がなければ環境変数のみで検証する
}
import { ProjectRegistry, resolveProjectPath } from "../packages/core/src/config/projects";
import { openDb } from "../packages/core/src/db/client";

type CheckResult = { name: string; ok: boolean; detail: string; warn?: boolean };

const results: CheckResult[] = [];

function check(name: string, fn: () => string): void {
  try {
    results.push({ name, ok: true, detail: fn() });
  } catch (e) {
    results.push({ name, ok: false, detail: (e as Error).message });
  }
}

function warn(name: string, fn: () => string | null): void {
  try {
    const detail = fn();
    if (detail !== null) results.push({ name, ok: true, warn: true, detail });
    else results.push({ name, ok: true, detail: "OK" });
  } catch (e) {
    results.push({ name, ok: true, warn: true, detail: (e as Error).message });
  }
}

function commandVersion(cmd: string, args: string[] = ["--version"]): string {
  return execFileSync(cmd, args, { encoding: "utf8", timeout: 15000 }).trim().split("\n")[0] ?? "";
}

// --- Runtime ---
check("Node.js", () => {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) throw new Error(`Node.js 22+ required, found ${process.versions.node}`);
  return `v${process.versions.node}`;
});
check("pnpm", () => commandVersion("pnpm"));
check("git", () => commandVersion("git"));

// --- Environment variables ---
let env: ReturnType<typeof parseEnv> | null = null;
check("環境変数", () => {
  env = parseEnv();
  return "OK";
});

if (env) {
  const e = env;

  // --- Claude Code ---
  check("Claude Code", () => {
    const version = commandVersion(e.CLAUDE_COMMAND);
    const m = version.match(/^(\d+)\.(\d+)\./);
    if (!m) throw new Error(`Unrecognized version output: ${version}`);
    const [major, minor] = [Number(m[1]), Number(m[2])];
    if (major < 2 || (major === 2 && minor < 1)) {
      throw new Error(`Claude Code 2.1+ required, found ${version}`);
    }
    return version;
  });

  // --- CLAUDE* env contamination (capability-report §14-1-5) ---
  warn("CLAUDE*環境変数", () => {
    // 本システム自身の設定変数は混入とみなさない
    const own = new Set(["CLAUDE_ADAPTER", "CLAUDE_COMMAND", "CLAUDE_JOB_MODEL"]);
    const contaminated = Object.keys(process.env).filter(
      (k) =>
        (k === "CLAUDECODE" || k.startsWith("CLAUDE_")) &&
        !own.has(k) &&
        !k.startsWith("CLAUDE_REMOTE_"),
    );
    if (contaminated.length > 0) {
      return `検出: ${contaminated.join(", ")} — Claude Code内から起動している可能性。ジョブ起動時はサニタイズされるが、常駐運用では通常のシェルから起動すること`;
    }
    return null;
  });

  // --- SQLite ---
  check("SQLite書き込み", () => {
    const { sqlite } = openDb(e.DATABASE_PATH);
    sqlite.prepare("SELECT 1").get();
    sqlite.close();
    return e.DATABASE_PATH;
  });

  // --- Repository Registry ---
  check("Repository Registry", () => {
    const registry = ProjectRegistry.load(e.PROJECT_CONFIG_PATH);
    const enabled = registry.listEnabled();
    for (const p of enabled) resolveProjectPath(p);
    return `${enabled.length} project(s) enabled`;
  });

  // --- worktree root ---
  check("worktree root", () => {
    fs.mkdirSync(e.WORKTREE_ROOT, { recursive: true });
    fs.accessSync(e.WORKTREE_ROOT, fs.constants.W_OK);
    return e.WORKTREE_ROOT;
  });

  // --- Slack ---
  warn("Slack設定", () => {
    const slack = slackConfigOf(e);
    if (!slack) return "未設定 — モックアダプタで動作(Slack通知なし)";
    if (slack.allowedUserIds.length === 0)
      return "ALLOWED_SLACK_USER_IDS が空 — Slackからの操作を全て拒否する";
    return null;
  });

  // --- Remote Control (optional) ---
  warn("Remote Control", () => {
    try {
      execFileSync(e.CLAUDE_COMMAND, ["remote-control", "--help"], {
        encoding: "utf8",
        timeout: 15000,
      });
      return null;
    } catch {
      return "remote-controlサブコマンドが見つからない(任意機能のため動作には影響なし)";
    }
  });

  // --- Tailscale (optional) ---
  warn("Tailscale", () => {
    try {
      execFileSync("tailscale", ["status", "--peers=false"], { encoding: "utf8", timeout: 15000 });
      return null;
    } catch {
      return "tailscaleコマンドが見つからないか未接続(外部アクセスに必要。ローカル開発では不要)";
    }
  });

  // --- macOS sleep ---
  warn("Macスリープ設定", () => {
    try {
      const out = execFileSync("pmset", ["-g"], { encoding: "utf8", timeout: 15000 });
      const m = out.match(/^\s*sleep\s+(\d+)/m);
      if (m && Number(m[1]) !== 0) {
        return `システムスリープが${m[1]}分に設定されている — 長時間ジョブはcaffeinate併用を推奨(README参照)`;
      }
      return null;
    } catch {
      return "pmsetを実行できない(macOS以外?)";
    }
  });
}

// --- Report ---
console.log("\nclaude-remote-manager doctor\n");
let failed = 0;
for (const r of results) {
  const mark = r.ok ? (r.warn ? "⚠" : "✓") : "✗";
  if (!r.ok) failed++;
  console.log(`${mark} ${r.name}: ${r.detail}`);
}
console.log("");
if (failed > 0) {
  console.log(`${failed} check(s) failed`);
  process.exit(1);
}
console.log("All required checks passed");
