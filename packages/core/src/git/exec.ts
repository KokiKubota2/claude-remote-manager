import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class GitError extends Error {
  constructor(
    message: string,
    public readonly args: string[],
    public readonly stderr: string,
  ) {
    super(message);
  }
}

export type GitRunner = (args: string[], opts?: { cwd?: string }) => Promise<string>;

/**
 * gitコマンド実行ラッパ。必ずexecFileを使い、shellを経由しない(§19.4)。
 */
export function createGitRunner(gitCommand = "git"): GitRunner {
  return async (args: string[], opts: { cwd?: string } = {}): Promise<string> => {
    try {
      const { stdout } = await execFileAsync(gitCommand, args, {
        cwd: opts.cwd,
        maxBuffer: 32 * 1024 * 1024,
        timeout: 120_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
      return stdout;
    } catch (e) {
      const err = e as { stderr?: string; message?: string };
      throw new GitError(
        `git ${args.slice(0, 3).join(" ")} failed: ${(err.stderr ?? err.message ?? "").trim().slice(0, 500)}`,
        args,
        err.stderr ?? "",
      );
    }
  };
}
