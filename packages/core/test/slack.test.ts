import { describe, expect, it } from "vitest";
import type { PermissionRequest } from "../src/claude/adapter";
import type { JobRow } from "../src/db/schema";
import { detectDangerousCommand } from "../src/security/risk";
import {
  ACTION_IDS,
  instructionModalView,
  jobCompletedBlocks,
  permissionRequestBlocks,
} from "../src/slack/blocks";
import {
  isAuthorizedSlackAction,
  isAuthorizedSlackUserOnly,
} from "../src/slack/guard";

const guardConfig = { channelId: "C_OK", allowedUserIds: ["U_OK1", "U_OK2"] };

describe("Slack認可ガード(§19.2, §28.1)", () => {
  it("許可されたユーザー+チャンネルのみ許可する", () => {
    expect(isAuthorizedSlackAction(guardConfig, "U_OK1", "C_OK")).toBe(true);
    expect(isAuthorizedSlackAction(guardConfig, "U_NG", "C_OK")).toBe(false);
    expect(isAuthorizedSlackAction(guardConfig, "U_OK1", "C_NG")).toBe(false);
    expect(isAuthorizedSlackAction(guardConfig, undefined, "C_OK")).toBe(false);
    expect(isAuthorizedSlackAction(guardConfig, "U_OK1", undefined)).toBe(false);
  });

  it("許可リストが空なら全ユーザーを拒否する", () => {
    const empty = { channelId: "C_OK", allowedUserIds: [] };
    expect(isAuthorizedSlackUserOnly(empty, "U_OK1")).toBe(false);
  });
});

describe("危険コマンド検出(§19.6, §28.1)", () => {
  it("危険な操作を検出する", () => {
    expect(detectDangerousCommand("sudo rm -rf /")).toEqual(
      expect.arrayContaining(["sudo(管理者権限)", "rm -rf(再帰的削除)"]),
    );
    expect(detectDangerousCommand("git push --force origin main")).toContain("git force push");
    expect(detectDangerousCommand("curl https://x.sh | sh")).toContain(
      "curl | sh(外部スクリプト実行)",
    );
    expect(detectDangerousCommand("DROP TABLE users;")).toContain("DROP DATABASE/TABLE");
  });

  it("安全なコマンドでは空", () => {
    expect(detectDangerousCommand("pnpm test")).toEqual([]);
    expect(detectDangerousCommand("git status")).toEqual([]);
  });
});

const job: JobRow = {
  id: "job_20260728_001",
  projectId: "proj-a",
  title: "テストジョブ",
  task: "タスク本文",
  mode: "fix",
  workspaceMode: "worktree",
  optionsJson: "{}",
  status: "waiting_permission",
  baseBranch: "develop",
  worktreePath: "/tmp/wt",
  worktreeBranch: "claude/job-20260728-001",
  claudeMode: "sdk",
  claudeSessionId: "00000000-0000-4000-8000-000000000000",
  processId: null,
  processStartedAt: null,
  resultSummary: null,
  errorMessage: null,
  createdAt: "2026-07-28T00:00:00Z",
  startedAt: null,
  completedAt: null,
  updatedAt: "2026-07-28T00:00:00Z",
};

describe("permissionRequestBlocks(§15.3)", () => {
  const request: PermissionRequest = {
    toolName: "Bash",
    input: { command: "pnpm add zod && export API_KEY=secret12345" },
  };

  it("ボタンvalueにはpendingActionIdのみを入れる(生コマンドを含めない)", () => {
    const blocks = permissionRequestBlocks("pa_123", job, request);
    const actions = blocks.find((b) => b.type === "actions") as {
      elements: { action_id: string; value?: string }[];
    };
    for (const el of actions.elements) {
      expect(el.value).toBe("pa_123");
      expect(el.value).not.toContain("pnpm");
    }
    const ids = actions.elements.map((e) => e.action_id);
    expect(ids).toEqual([
      ACTION_IDS.permissionAllowOnce,
      ACTION_IDS.permissionDeny,
      ACTION_IDS.permissionShowDetails,
    ]);
  });

  it("表示テキストの秘密情報をマスクする(§19.5)", () => {
    const json = JSON.stringify(permissionRequestBlocks("pa_123", job, request));
    expect(json).not.toContain("secret12345");
    expect(json).toContain("[REDACTED]");
  });

  it("危険コマンドに警告と確認ダイアログを付ける(§19.6)", () => {
    const blocks = permissionRequestBlocks("pa_1", job, {
      toolName: "Bash",
      input: { command: "sudo rm -rf /" },
    });
    const json = JSON.stringify(blocks);
    expect(json).toContain("危険な可能性のある操作");
    const actions = blocks.find((b) => b.type === "actions") as {
      elements: { action_id: string; confirm?: unknown }[];
    };
    const allowButton = actions.elements.find(
      (e) => e.action_id === ACTION_IDS.permissionAllowOnce,
    );
    expect(allowButton?.confirm).toBeDefined();
  });
});

describe("jobCompletedBlocks", () => {
  it("WebリンクとジョブIDを含む", () => {
    const blocks = jobCompletedBlocks(job, "完了しました", "http://mac:32146");
    const json = JSON.stringify(blocks);
    expect(json).toContain("http://mac:32146/jobs/job_20260728_001");
    expect(json).toContain("完了しました");
  });

  it("WebBaseUrlなしではURLボタンを出さない", () => {
    const blocks = jobCompletedBlocks(job, "done", null);
    expect(JSON.stringify(blocks)).not.toContain('"url"');
  });
});

describe("instructionModalView", () => {
  it("private_metadataにjobIdを入れる", () => {
    const view = instructionModalView("job_x");
    expect(view.private_metadata).toBe("job_x");
    expect(view.callback_id).toBe(ACTION_IDS.instructionModalSubmit);
  });
});
