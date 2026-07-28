/**
 * Claude Code子プロセスへ渡す環境変数のサニタイズ。
 *
 * CLAUDECODE / CLAUDE_CODE_* 等が継承されると、子セッションが
 * 「ネストされたClaude Code」と判定されトランスクリプト保存が無効化され、
 * --resume が不可能になる(capability-report §14-1-5 実測)。
 */
export function sanitizeClaudeEnv(
  source: NodeJS.ProcessEnv,
  extra: Record<string, string> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (key === "CLAUDECODE") continue;
    if (key.startsWith("CLAUDE_")) continue;
    out[key] = value;
  }
  return { ...out, ...extra };
}
