import fs from "node:fs";
import path from "node:path";
import { GitError, type GitRunner } from "./exec";
import { worktreeBranchOf, worktreePathOf } from "./naming";

export class WorktreeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorktreeError";
  }
}

export function isWorktreeError(e: unknown): boolean {
  return e instanceof WorktreeError || (e as Error | null)?.name === "WorktreeError";
}

export type WorktreeInfo = {
  worktreePath: string;
  branch: string;
  baseRef: string;
};

export type DiffFile = {
  path: string;
  additions: number;
  deletions: number;
  binary: boolean;
};

export type DiffSummary = {
  files: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
};

export class WorktreeManager {
  constructor(
    private readonly git: GitRunner,
    private readonly worktreeRoot: string,
  ) {}

  /** リポジトリの正常性確認(§11.3) */
  async assertHealthyRepository(repoPath: string): Promise<void> {
    try {
      const out = await this.git(["-C", repoPath, "rev-parse", "--is-inside-work-tree"]);
      if (out.trim() !== "true") throw new WorktreeError(`Not a git work tree: ${repoPath}`);
    } catch (e) {
      if (e instanceof WorktreeError) throw e;
      throw new WorktreeError(`Not a healthy git repository: ${repoPath} (${(e as Error).message})`);
    }
  }

  async fetchOrigin(repoPath: string): Promise<void> {
    try {
      await this.git(["-C", repoPath, "fetch", "origin", "--prune"]);
    } catch (e) {
      throw new WorktreeError(`git fetch failed: ${(e as GitError).message}`);
    }
  }

  async remoteBranchExists(repoPath: string, branch: string): Promise<boolean> {
    try {
      const out = await this.git(["-C", repoPath, "rev-parse", "--verify", `origin/${branch}`]);
      return out.trim().length > 0;
    } catch {
      return false;
    }
  }

  async localBranchExists(repoPath: string, branch: string): Promise<boolean> {
    try {
      await this.git(["-C", repoPath, "rev-parse", "--verify", `refs/heads/${branch}`]);
      return true;
    } catch {
      return false;
    }
  }

  /** リモートに存在するブランチ一覧(§11.2 ベースブランチ選択肢用) */
  async listRemoteBranches(repoPath: string): Promise<string[]> {
    const out = await this.git([
      "-C",
      repoPath,
      "for-each-ref",
      "--format=%(refname:short)",
      "refs/remotes/origin",
    ]);
    return out
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.endsWith("/HEAD"))
      .map((l) => l.replace(/^origin\//, ""));
  }

  /**
   * ジョブ用worktreeを作成する(§11.1, §11.3)。
   * - 衝突検査: 同名ブランチ・既存パス
   * - fetch失敗時はfallbackToLocal=falseなら中止(§21.5)
   */
  async createJobWorktree(opts: {
    repoPath: string;
    projectId: string;
    jobId: string;
    baseBranch: string;
    fallbackToLocal?: boolean;
  }): Promise<WorktreeInfo> {
    const { repoPath, projectId, jobId, baseBranch } = opts;
    await this.assertHealthyRepository(repoPath);

    const branch = worktreeBranchOf(jobId);
    const worktreePath = worktreePathOf(this.worktreeRoot, projectId, jobId);

    if (fs.existsSync(worktreePath)) {
      throw new WorktreeError(`Worktree path already exists: ${worktreePath}`);
    }
    if (await this.localBranchExists(repoPath, branch)) {
      throw new WorktreeError(`Branch already exists: ${branch}`);
    }

    let baseRef: string;
    let fetched = false;
    try {
      await this.fetchOrigin(repoPath);
      fetched = true;
    } catch (e) {
      if (!opts.fallbackToLocal) throw e;
    }

    if (fetched && (await this.remoteBranchExists(repoPath, baseBranch))) {
      baseRef = `origin/${baseBranch}`;
    } else if (await this.localBranchExists(repoPath, baseBranch)) {
      baseRef = baseBranch;
    } else {
      throw new WorktreeError(`Base branch not found: ${baseBranch} (local or origin)`);
    }

    fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
    await this.git(["-C", repoPath, "worktree", "add", "-b", branch, worktreePath, baseRef]);
    return { worktreePath, branch, baseRef };
  }

  /** ベースrefからの差分サマリ(§14.5)。バイナリはbinary=true */
  async diffSummary(worktreePath: string, baseRef: string): Promise<DiffSummary> {
    const out = await this.git([
      "-C",
      worktreePath,
      "diff",
      "--numstat",
      `${baseRef}...HEAD`,
    ]);
    const untracked = await this.git([
      "-C",
      worktreePath,
      "ls-files",
      "--others",
      "--exclude-standard",
    ]);
    const files: DiffFile[] = [];
    for (const line of out.split("\n")) {
      const m = line.trim().match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
      if (!m) continue;
      const [, add, del, filePath] = m;
      files.push({
        path: filePath as string,
        additions: add === "-" ? 0 : Number(add),
        deletions: del === "-" ? 0 : Number(del),
        binary: add === "-",
      });
    }
    // 未コミットの変更も含める(working tree diff)
    const wtDiff = await this.git(["-C", worktreePath, "diff", "--numstat"]);
    for (const line of wtDiff.split("\n")) {
      const m = line.trim().match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
      if (!m) continue;
      const [, add, del, filePath] = m;
      const existing = files.find((f) => f.path === filePath);
      if (existing) {
        existing.additions += add === "-" ? 0 : Number(add);
        existing.deletions += del === "-" ? 0 : Number(del);
      } else {
        files.push({
          path: filePath as string,
          additions: add === "-" ? 0 : Number(add),
          deletions: del === "-" ? 0 : Number(del),
          binary: add === "-",
        });
      }
    }
    for (const line of untracked.split("\n")) {
      const p = line.trim();
      if (!p) continue;
      let additions = 0;
      try {
        const content = fs.readFileSync(path.join(worktreePath, p), "utf8");
        additions = content.split("\n").length;
      } catch {
        // バイナリ等
      }
      files.push({ path: p, additions, deletions: 0, binary: additions === 0 });
    }
    return {
      files,
      totalAdditions: files.reduce((s, f) => s + f.additions, 0),
      totalDeletions: files.reduce((s, f) => s + f.deletions, 0),
    };
  }

  /** 単一ファイルのunified diffを返す(§14.5 ファイルごと展開用) */
  async fileDiff(worktreePath: string, baseRef: string, filePath: string): Promise<string> {
    // パス検証は呼び出し側(API層)でも行うが、ここでも保険をかける
    if (filePath.includes("..") || path.isAbsolute(filePath)) {
      throw new WorktreeError(`Invalid file path: ${filePath}`);
    }
    return this.git(["-C", worktreePath, "diff", `${baseRef}`, "--", filePath]);
  }

  async hasChanges(worktreePath: string): Promise<boolean> {
    const status = await this.git(["-C", worktreePath, "status", "--porcelain"]);
    if (status.trim().length > 0) return true;
    // コミット済みの差分(ブランチが進んでいるか)は呼び出し側でdiffSummaryを見る
    return false;
  }

  /** コミット作成(§11.4)。差分がなければWorktreeError */
  async commitAll(worktreePath: string, message: string): Promise<string> {
    await this.git(["-C", worktreePath, "add", "-A"]);
    const status = await this.git(["-C", worktreePath, "status", "--porcelain"]);
    if (status.trim().length === 0) {
      throw new WorktreeError("No changes to commit");
    }
    await this.git(["-C", worktreePath, "commit", "-m", message]);
    const sha = await this.git(["-C", worktreePath, "rev-parse", "HEAD"]);
    return sha.trim();
  }

  /**
   * worktreeを削除する(§11.4)。
   * keepBranch=trueならブランチは残す。
   */
  async removeWorktree(opts: {
    repoPath: string;
    worktreePath: string;
    branch: string;
    keepBranch: boolean;
  }): Promise<void> {
    const { repoPath, worktreePath, branch, keepBranch } = opts;
    // 安全確認: worktreeRoot配下のみ削除対象にする
    const rel = path.relative(this.worktreeRoot, worktreePath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new WorktreeError(`Refusing to remove path outside worktree root: ${worktreePath}`);
    }
    await this.git(["-C", repoPath, "worktree", "remove", "--force", worktreePath]);
    if (!keepBranch) {
      await this.git(["-C", repoPath, "branch", "-D", branch]);
    }
  }
}
