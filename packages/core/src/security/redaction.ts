/**
 * 秘密情報の簡易マスキング(§19.5)。
 * 完全な検出は不可能である前提で、明らかなパターンのみ置換する。
 */

const PATTERNS: RegExp[] = [
  // Slack tokens
  /\bxox[bapors]-[\w-]{10,}/g,
  /\bxapp-[\w-]{10,}/g,
  // OpenAI/Anthropic style keys
  /\bsk-[\w-]{16,}/g,
  // Bearer / Authorization headers
  /(\bAuthorization\s*[:=]\s*)(?:Bearer\s+)?[\w.~+/=-]{8,}/gi,
  /(\bBearer\s+)[\w.~+/=-]{16,}/g,
  // KEY=VALUE 形式の秘密変数
  /\b((?:[A-Z0-9_]*(?:API_KEY|TOKEN|PASSWORD|SECRET|CLIENT_SECRET|PRIVATE_KEY)[A-Z0-9_]*)\s*[:=]\s*)["']?[^\s"']{6,}["']?/g,
  // PEM private keys
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  // AWS access key id
  /\bAKIA[0-9A-Z]{16}\b/g,
  // GitHub tokens
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
];

const MASK = "[REDACTED]";

export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of PATTERNS) {
    out = out.replace(pattern, (match, prefix) =>
      typeof prefix === "string" && prefix.length > 0 && match.startsWith(prefix)
        ? `${prefix}${MASK}`
        : MASK,
    );
  }
  return out;
}
