import type { CreateJobInput, Project } from "../types/index";

const MODE_LABELS: Record<CreateJobInput["mode"], string> = {
  investigate: "調査のみ(コードの変更は行わない)",
  fix: "調査と修正",
  review: "コードレビュー",
  test: "テストの実行と修正",
};

/** タスク本文からClaude Codeへ渡すプロンプトを生成する(§10.3) */
export function buildTaskPrompt(project: Project, input: CreateJobInput): string {
  const lines: string[] = [
    "以下のタスクを実行してください。",
    "",
    `プロジェクト:`,
    project.name,
    "",
    "依頼:",
    input.task.trim(),
    "",
    "実行モード:",
    MODE_LABELS[input.mode],
    "",
    "実行方針:",
    "- まず原因や現状を調査してください",
    "- 変更前に関連コードを確認してください",
    "- 必要な範囲だけ変更してください",
    "- 既存仕様との互換性を維持してください",
  ];
  if (input.mode === "investigate") {
    lines.push("- 調査のみを行い、ファイルの変更やコマンドによる状態変更は行わないでください");
  }
  if (input.options.runTests) {
    lines.push("- 変更後に関連テストを実行してください");
    lines.push("- 新たな型エラーやLintエラーがないことを確認してください");
  }
  if (!input.options.allowDependencyInstall) {
    lines.push("- 依存パッケージの追加・更新は行わないでください");
  }
  lines.push(
    "- 最後に原因、変更内容、テスト結果を簡潔に要約してください",
    "- 判断が必要な場合は勝手に大きな設計変更をせず質問してください",
    "",
    "禁止事項:",
    "- git push を実行しない",
    "- force pushしない",
    "- リモートブランチを削除しない",
    "- 本番環境へデプロイしない",
    "- 秘密情報を出力しない",
    "- 作業ディレクトリの外のファイルを変更しない",
  );
  if (input.options.createCommit) {
    lines.push("", "作業完了後、変更をコミットしてください(pushはしない)。");
  } else {
    lines.push("", "コミットは作成しないでください(変更はワーキングツリーに残す)。");
  }
  return lines.join("\n");
}
