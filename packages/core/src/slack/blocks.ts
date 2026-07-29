import type { PermissionRequest } from "../claude/adapter";
import type { JobRow } from "../db/schema";
import { redactSecrets } from "../security/redaction";
import { detectDangerousCommand } from "../security/risk";

/**
 * Slack Block Kitメッセージ(§15)。
 * ボタンのvalueにはID(pendingActionId / jobId)だけを入れ、生のコマンドを含めない(§15.3)。
 */

export const ACTION_IDS = {
  permissionAllowOnce: "permission_allow_once",
  permissionDeny: "permission_deny",
  permissionShowDetails: "permission_show_details",
  jobStop: "job_stop",
  openInstructionModal: "open_instruction_modal",
  instructionModalSubmit: "instruction_modal_submit",
} as const;

type Block = Record<string, unknown>;

function truncate(text: string, max = 500): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function display(text: string, max = 500): string {
  return redactSecrets(truncate(text, max));
}

function section(text: string): Block {
  return { type: "section", text: { type: "mrkdwn", text } };
}

function context(text: string): Block {
  return { type: "context", elements: [{ type: "mrkdwn", text }] };
}

function webLink(baseUrl: string | null, jobId: string): string {
  return baseUrl ? `${baseUrl}/jobs/${jobId}` : "";
}

function jobHeaderText(emoji: string, title: string, job: JobRow): string {
  return `${emoji} *${title}*\n\n*プロジェクト*\n${job.projectId}\n\n*ジョブ*\n${display(job.title, 120)}`;
}

export function jobStartedBlocks(job: JobRow, webBaseUrl: string | null): Block[] {
  const blocks: Block[] = [
    section(jobHeaderText("🚀", "Claude Codeジョブを開始しました", job)),
    section(`*タスク*\n${display(job.task, 300)}`),
    context(
      `ベース: ${job.baseBranch}` + (job.worktreeBranch ? ` ・ 作業: ${job.worktreeBranch}` : ""),
    ),
  ];
  const url = webLink(webBaseUrl, job.id);
  const actions: Block = {
    type: "actions",
    elements: [
      ...(url
        ? [{ type: "button", text: { type: "plain_text", text: "Webで状況を見る" }, url }]
        : []),
      {
        type: "button",
        style: "danger",
        text: { type: "plain_text", text: "停止" },
        action_id: ACTION_IDS.jobStop,
        value: job.id,
        confirm: {
          title: { type: "plain_text", text: "ジョブを停止しますか?" },
          text: { type: "mrkdwn", text: "worktreeは削除されません。" },
          confirm: { type: "plain_text", text: "停止する" },
          deny: { type: "plain_text", text: "やめる" },
        },
      },
    ],
  };
  blocks.push(actions);
  return blocks;
}

export function jobCompletedBlocks(
  job: JobRow,
  resultText: string,
  webBaseUrl: string | null,
): Block[] {
  const url = webLink(webBaseUrl, job.id);
  return [
    section(jobHeaderText("✅", "Claude Codeジョブが完了しました", job)),
    section(`*結果*\n${display(resultText, 1500)}`),
    {
      type: "actions",
      elements: [
        ...(url
          ? [
              { type: "button", text: { type: "plain_text", text: "結果を見る" }, url },
              {
                type: "button",
                text: { type: "plain_text", text: "差分を見る" },
                url: `${url}/diff`,
              },
            ]
          : []),
        {
          type: "button",
          text: { type: "plain_text", text: "追加修正" },
          action_id: ACTION_IDS.openInstructionModal,
          value: job.id,
        },
      ],
    },
  ];
}

export function jobFailedBlocks(job: JobRow, error: string, webBaseUrl: string | null): Block[] {
  const url = webLink(webBaseUrl, job.id);
  return [
    section(jobHeaderText("❌", "Claude Codeジョブが停止しました", job)),
    section(`*エラー*\n${display(error, 800)}`),
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "指示を入力" },
          action_id: ACTION_IDS.openInstructionModal,
          value: job.id,
        },
        ...(url ? [{ type: "button", text: { type: "plain_text", text: "Webで確認" }, url }] : []),
      ],
    },
  ];
}

export function jobCancelledBlocks(job: JobRow): Block[] {
  return [section(jobHeaderText("⏹", "Claude Codeジョブを停止しました", job))];
}

export function awaitingDecisionBlocks(
  job: JobRow,
  latestMessage: string,
  webBaseUrl: string | null,
): Block[] {
  const url = webLink(webBaseUrl, job.id);
  return [
    section(jobHeaderText("🤔", "Claude Codeが応答を終了しました", job)),
    section(`*Claudeからのメッセージ*\n${display(latestMessage, 1500)}`),
    context("完了したか、追加指示を待っています。"),
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "指示を入力" },
          action_id: ACTION_IDS.openInstructionModal,
          value: job.id,
        },
        ...(url ? [{ type: "button", text: { type: "plain_text", text: "Webで開く" }, url }] : []),
        {
          type: "button",
          style: "danger",
          text: { type: "plain_text", text: "停止" },
          action_id: ACTION_IDS.jobStop,
          value: job.id,
          confirm: {
            title: { type: "plain_text", text: "ジョブを停止しますか?" },
            text: { type: "mrkdwn", text: "worktreeは削除されません。" },
            confirm: { type: "plain_text", text: "停止する" },
            deny: { type: "plain_text", text: "やめる" },
          },
        },
      ],
    },
  ];
}

export function permissionRequestBlocks(
  pendingActionId: string,
  job: JobRow,
  request: PermissionRequest,
): Block[] {
  const commandText =
    typeof request.input.command === "string"
      ? request.input.command
      : JSON.stringify(request.input);
  const warnings = detectDangerousCommand(commandText);
  const blocks: Block[] = [
    section(jobHeaderText("🔐", "実行許可が必要です", job)),
    section(
      `*ツール*\n${request.toolName}\n\n*実行内容*\n\`\`\`${display(commandText, 400)}\`\`\``,
    ),
  ];
  if (request.title) blocks.push(context(display(request.title, 200)));
  if (warnings.length > 0) {
    blocks.push(section(`⚠️ *危険な可能性のある操作*\n${warnings.map((w) => `・${w}`).join("\n")}`));
  }
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        style: "primary",
        text: { type: "plain_text", text: "今回のみ許可" },
        action_id: ACTION_IDS.permissionAllowOnce,
        value: pendingActionId,
        ...(warnings.length > 0
          ? {
              confirm: {
                title: { type: "plain_text", text: "危険な可能性があります" },
                text: { type: "mrkdwn", text: warnings.map((w) => `・${w}`).join("\n") },
                confirm: { type: "plain_text", text: "許可する" },
                deny: { type: "plain_text", text: "やめる" },
              },
            }
          : {}),
      },
      {
        type: "button",
        style: "danger",
        text: { type: "plain_text", text: "拒否" },
        action_id: ACTION_IDS.permissionDeny,
        value: pendingActionId,
      },
      {
        type: "button",
        text: { type: "plain_text", text: "詳細" },
        action_id: ACTION_IDS.permissionShowDetails,
        value: pendingActionId,
      },
    ],
  });
  return blocks;
}

export function permissionAnsweredBlocks(
  job: JobRow,
  request: PermissionRequest,
  answer: "allow_once" | "deny" | "expired",
  answeredBy: string | null,
): Block[] {
  const labels = {
    allow_once: "✅ 許可しました",
    deny: "🚫 拒否しました",
    expired: "⏰ 期限切れのため拒否しました",
  } as const;
  const commandText =
    typeof request.input.command === "string"
      ? request.input.command
      : JSON.stringify(request.input);
  return [
    section(jobHeaderText("🔐", "実行許可", job)),
    section(`*ツール*\n${request.toolName}\n\n\`\`\`${display(commandText, 200)}\`\`\``),
    context(`${labels[answer]}${answeredBy ? ` (<@${answeredBy}>)` : ""}`),
  ];
}

export function localSessionIdleBlocks(
  session: { name: string; cwd: string },
  lastMessage: string | null,
  webBaseUrl: string | null,
): Block[] {
  const blocks: Block[] = [
    section(
      `💤 *ローカルセッションが入力待ちになりました*\n\n*セッション*\n${display(session.name, 80)}\n\n*ディレクトリ*\n\`${display(session.cwd, 120)}\``,
    ),
  ];
  if (lastMessage) {
    blocks.push(section(`*最後のメッセージ*\n${display(lastMessage, 800)}`));
  }
  blocks.push(
    context(
      webBaseUrl
        ? `<${webBaseUrl}/sessions|Webで一覧を見る> ・ 続きはターミナル、または \`claude remote-control\` で操作できます`
        : "続きはターミナル、または `claude remote-control` で操作できます",
    ),
  );
  return blocks;
}

export function instructionModalView(jobId: string): Record<string, unknown> {
  return {
    type: "modal",
    callback_id: ACTION_IDS.instructionModalSubmit,
    private_metadata: jobId,
    title: { type: "plain_text", text: "追加指示" },
    submit: { type: "plain_text", text: "送信" },
    close: { type: "plain_text", text: "キャンセル" },
    blocks: [
      {
        type: "input",
        block_id: "instruction_block",
        label: { type: "plain_text", text: "Claude Codeへの指示" },
        element: {
          type: "plain_text_input",
          action_id: "instruction_input",
          multiline: true,
          max_length: 4000,
          placeholder: { type: "plain_text", text: "例: 提案どおり進めてください" },
        },
      },
    ],
  };
}
