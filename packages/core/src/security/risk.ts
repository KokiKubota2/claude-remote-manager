/**
 * 危険コマンド検出(§19.6)。
 * 自動許可の判断には使わない。Slack/Web表示時の警告用。
 */

const RULES: { pattern: RegExp; label: string }[] = [
  { pattern: /\bsudo\b/, label: "sudo(管理者権限)" },
  { pattern: /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b/i, label: "rm -rf(再帰的削除)" },
  { pattern: /\bgit\s+push\b.*(--force|-f\b)/, label: "git force push" },
  { pattern: /\bgit\s+push\b/, label: "git push(リモートへの反映)" },
  { pattern: /\bgit\s+reset\s+--hard\b/, label: "git reset --hard(変更破棄)" },
  { pattern: /\bgit\s+clean\s+-[a-z]*f/, label: "git clean -f(未追跡ファイル削除)" },
  { pattern: /\b(npm|pnpm|yarn)\s+publish\b/, label: "パッケージ公開" },
  { pattern: /\bterraform\s+(destroy|apply)\b/, label: "terraform destroy/apply" },
  { pattern: /\bkubectl\s+(delete|apply)\b/, label: "kubectl delete/apply" },
  { pattern: /\bDROP\s+(DATABASE|TABLE)\b/i, label: "DROP DATABASE/TABLE" },
  { pattern: /\bDELETE\s+FROM\b/i, label: "DELETE FROM" },
  { pattern: /\bTRUNCATE\b/i, label: "TRUNCATE" },
  { pattern: /curl[^|;&]*\|\s*(ba)?sh\b/, label: "curl | sh(外部スクリプト実行)" },
  { pattern: /\bchmod\s+777\b/, label: "chmod 777" },
];

/** コマンド文字列から危険な操作の警告ラベルを返す */
export function detectDangerousCommand(text: string): string[] {
  const labels: string[] = [];
  for (const rule of RULES) {
    if (rule.pattern.test(text)) labels.push(rule.label);
  }
  return labels;
}
