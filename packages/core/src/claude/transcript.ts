import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Claude Codeのトランスクリプト保存パスを求める。
 * 実測(capability-report §12): ~/.claude/projects/<cwdの'/'と'.'を'-'に置換>/<sessionId>.jsonl
 */
export function transcriptPathOf(cwd: string, sessionId: string): string {
  const encoded = path.resolve(cwd).replaceAll(/[/.]/g, "-");
  return path.join(os.homedir(), ".claude", "projects", encoded, `${sessionId}.jsonl`);
}

export function transcriptExists(cwd: string, sessionId: string): boolean {
  try {
    return fs.existsSync(transcriptPathOf(cwd, sessionId));
  } catch {
    return false;
  }
}
