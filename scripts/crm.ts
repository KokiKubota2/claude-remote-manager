import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "../packages/core/src/config/env";
import { ProjectRegistry } from "../packages/core/src/config/projects";

/**
 * ターミナルからClaude Remoteのジョブを操作するCLI。
 *
 * ターミナルで起動しても管理下ジョブになるため、許可要求・追加指示は
 * スマホ(Web)やSlackから行える = 外出先から判断してタスクを続行できる。
 */

const repoRoot = path.resolve(import.meta.dirname, "..");
try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // 環境変数のみで動作
}
if (!process.env.CRM_BASE_DIR) process.env.CRM_BASE_DIR = repoRoot;

const env = parseEnv();
const BASE = `http://127.0.0.1:${env.WEB_PORT}`;
/** CLIは実行ディレクトリから対象プロジェクトを判定する(ラッパが渡す) */
const userCwd = process.env.CRM_USER_CWD ?? process.cwd();

let cookie: string | null = null;

async function api(pathname: string, init: RequestInit = {}): Promise<Response> {
  if (!cookie) {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: env.WEB_AUTH_TOKEN }),
    }).catch(() => null);
    if (!res || !res.ok) {
      fail(
        `Claude Remoteサーバーへ接続できません(${BASE})。\n  起動: cd ${repoRoot} && pnpm start`,
      );
    }
    cookie = res!.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  }
  return fetch(`${BASE}${pathname}`, {
    ...init,
    headers: { "Content-Type": "application/json", Cookie: cookie!, ...init.headers },
  });
}

function fail(message: string): never {
  console.error(`エラー: ${message}`);
  process.exit(1);
}

/** 実行ディレクトリを含む登録プロジェクトを探す */
function detectProject(): { id: string; name: string } {
  const registry = ProjectRegistry.load(env.PROJECT_CONFIG_PATH);
  const cwdReal = fs.realpathSync(userCwd);
  const matches = registry
    .listEnabled()
    .filter((p) => {
      let repoReal: string;
      try {
        repoReal = fs.realpathSync(p.repositoryPath);
      } catch {
        return false;
      }
      const rel = path.relative(repoReal, cwdReal);
      return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
    })
    // 最も深く一致するもの(worktree内などを考慮)
    .sort((a, b) => b.repositoryPath.length - a.repositoryPath.length);

  const project = matches[0];
  if (!project) {
    fail(
      `このディレクトリは登録プロジェクトではありません: ${cwdReal}\n` +
        `  登録済み: ${registry
          .listEnabled()
          .map((p) => p.id)
          .join(", ")}\n  --project <id> で明示指定もできます`,
    );
  }
  return { id: project.id, name: project.name };
}

type JobView = {
  id: string;
  status: string;
  title: string;
  resultSummary: string | null;
  errorMessage: string | null;
  worktreeBranch: string | null;
};

const TERMINAL = ["completed", "failed", "cancelled", "expired", "orphaned"];
const STATUS_LABEL: Record<string, string> = {
  queued: "待機中",
  preparing: "準備中",
  starting: "起動中",
  running: "実行中",
  waiting_permission: "許可待ち",
  waiting_input: "判断待ち",
  completed: "完了",
  failed: "失敗",
  cancel_requested: "停止処理中",
  cancelled: "停止済み",
  expired: "期限切れ",
  orphaned: "孤立",
};

async function fetchJob(jobId: string): Promise<{ job: JobView; events: { id: string; type: string; payloadJson: string }[] }> {
  const res = await api(`/api/jobs/${jobId}`);
  if (!res.ok) fail(`ジョブを取得できません: ${jobId}`);
  return (await res.json()) as never;
}

/** 完了までターミナルへ進捗を表示する */
async function follow(jobId: string): Promise<void> {
  const seenEvents = new Set<string>();
  const seenPending = new Set<string>();
  let lastStatus = "";

  const webUrl = env.WEB_BASE_URL ?? BASE;
  console.log(`\n  ${webUrl}/jobs/${jobId}\n`);

  for (;;) {
    const { job, events } = await fetchJob(jobId);

    if (job.status !== lastStatus) {
      console.log(`[${STATUS_LABEL[job.status] ?? job.status}]`);
      lastStatus = job.status;
    }

    for (const event of [...events].reverse()) {
      if (seenEvents.has(event.id)) continue;
      seenEvents.add(event.id);
      if (event.type !== "log") continue;
      try {
        const payload = JSON.parse(event.payloadJson) as { message?: string };
        if (payload.message) console.log(`\n${payload.message}\n`);
      } catch {
        // 表示できない payload は無視
      }
    }

    if (job.status === "waiting_permission") {
      const res = await api(`/api/jobs/${jobId}/pending`);
      if (res.ok) {
        const { pending } = (await res.json()) as {
          pending: { id: string; toolName: string; commandText: string; warnings: string[] }[];
        };
        for (const p of pending) {
          if (seenPending.has(p.id)) continue;
          seenPending.add(p.id);
          console.log(`🔐 許可が必要です: ${p.toolName}`);
          console.log(`   ${p.commandText.split("\n")[0]?.slice(0, 160)}`);
          if (p.warnings.length > 0) console.log(`   ⚠️  ${p.warnings.join(" / ")}`);
          console.log(`   スマホ/Slackから回答するか、別ターミナルで:`);
          console.log(`   crm allow ${jobId}    /    crm deny ${jobId}\n`);
        }
      }
    }

    if (TERMINAL.includes(job.status)) {
      if (job.resultSummary) console.log(`\n${job.resultSummary}\n`);
      if (job.errorMessage) console.log(`\n${job.errorMessage}\n`);
      if (job.worktreeBranch) console.log(`作業ブランチ: ${job.worktreeBranch}`);
      console.log(
        job.status === "completed"
          ? `\n追加指示: crm say ${jobId} "<指示>"`
          : `\n詳細: ${webUrl}/jobs/${jobId}`,
      );
      return;
    }

    await new Promise((r) => setTimeout(r, 2000));
  }
}

/** 直近のジョブID(jobId省略時に使う) */
async function latestJobId(): Promise<string> {
  const res = await api("/api/jobs");
  if (!res.ok) fail("ジョブ一覧を取得できません");
  const { jobs } = (await res.json()) as { jobs: { id: string }[] };
  const first = jobs[0];
  if (!first) fail("ジョブがありません");
  return first.id;
}

async function answerPermission(jobId: string, answer: "allow_once" | "deny"): Promise<void> {
  const res = await api(`/api/jobs/${jobId}/pending`);
  if (!res.ok) fail("許可要求を取得できません");
  const { pending } = (await res.json()) as { pending: { id: string; toolName: string }[] };
  if (pending.length === 0) fail("回答待ちの許可要求はありません");
  for (const p of pending) {
    const answerRes = await api(`/api/actions/${p.id}/answer`, {
      method: "POST",
      body: JSON.stringify({ answer }),
    });
    const body = (await answerRes.json().catch(() => ({}))) as { error?: string };
    console.log(
      answerRes.ok
        ? `${answer === "allow_once" ? "許可" : "拒否"}しました: ${p.toolName}`
        : `失敗: ${body.error ?? answerRes.status}`,
    );
  }
}

function usage(): never {
  console.log(`Claude Remote CLI

  crm run <タスク内容>        現在のディレクトリのプロジェクトでジョブを開始し、完了まで表示
    --project <id>            プロジェクトを明示指定
    --investigate             調査のみ(既定は修正まで)
    --test                    テストを実行させる
    --commit                  完了時にコミットを作成させる
    --detach                  開始だけして待たない

  crm say [<jobId>] <指示>    追加指示を送る(jobId省略で直近のジョブ)
  crm watch [<jobId>]         進捗を表示する
  crm allow [<jobId>]         許可要求を承認する
  crm deny [<jobId>]          許可要求を拒否する
  crm stop [<jobId>]          ジョブを停止する
  crm list                    最近のジョブ一覧

外出先からはスマホのWeb画面/Slackで許可・追加指示ができます。`);
  process.exit(0);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv.shift();
  if (!command || command === "help" || command === "--help") usage();

  switch (command) {
    case "run": {
      const flags = new Set(argv.filter((a) => a.startsWith("--")));
      let projectId: string | null = null;
      const projectIndex = argv.indexOf("--project");
      if (projectIndex >= 0) projectId = argv[projectIndex + 1] ?? null;
      const task = argv
        .filter((a, i) => !a.startsWith("--") && i !== projectIndex + 1)
        .join(" ")
        .trim();
      if (!task) fail("タスク内容を指定してください");

      const project = projectId ? { id: projectId, name: projectId } : detectProject();
      const res = await api("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          projectId: project.id,
          task,
          mode: flags.has("--investigate") ? "investigate" : "fix",
          workspaceMode: "worktree",
          options: {
            runTests: flags.has("--test"),
            allowDependencyInstall: false,
            createCommit: flags.has("--commit"),
          },
        }),
      });
      const body = (await res.json()) as { job?: { id: string }; error?: string };
      if (!res.ok || !body.job) fail(body.error ?? "ジョブを作成できませんでした");
      console.log(`ジョブを開始しました: ${body.job.id} (${project.name})`);
      if (flags.has("--detach")) {
        console.log(`${env.WEB_BASE_URL ?? BASE}/jobs/${body.job.id}`);
        return;
      }
      await follow(body.job.id);
      return;
    }
    case "say": {
      const first = argv[0];
      const jobId = first?.startsWith("job_") ? argv.shift()! : await latestJobId();
      const message = argv.join(" ").trim();
      if (!message) fail("指示内容を指定してください");
      const res = await api(`/api/jobs/${jobId}/messages`, {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) fail(body.error ?? "送信できませんでした");
      console.log(`送信しました: ${jobId}`);
      await follow(jobId);
      return;
    }
    case "watch": {
      const jobId = argv[0] ?? (await latestJobId());
      await follow(jobId);
      return;
    }
    case "allow":
      await answerPermission(argv[0] ?? (await latestJobId()), "allow_once");
      return;
    case "deny":
      await answerPermission(argv[0] ?? (await latestJobId()), "deny");
      return;
    case "stop": {
      const jobId = argv[0] ?? (await latestJobId());
      const res = await api(`/api/jobs/${jobId}/cancel`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      console.log(res.ok ? `停止を要求しました: ${jobId}` : `失敗: ${body.error ?? res.status}`);
      return;
    }
    case "list": {
      const res = await api("/api/jobs");
      const { jobs } = (await res.json()) as {
        jobs: { id: string; projectId: string; status: string; title: string }[];
      };
      for (const job of jobs.slice(0, 15)) {
        const label = (STATUS_LABEL[job.status] ?? job.status).padEnd(6, "　");
        console.log(`${label} ${job.id}  ${job.projectId}  ${job.title.slice(0, 40)}`);
      }
      return;
    }
    default:
      fail(`不明なコマンド: ${command}(crm help で使い方を表示)`);
  }
}

main().catch((e) => fail((e as Error).message));
