import "server-only";
import {
  ProjectRegistry,
  WorktreeManager,
  createGitRunner,
  getEnv,
  openDb,
  type Db,
  type Env,
} from "@claude-remote/core";

/**
 * Next.jsサーバープロセス内のシングルトン。
 * dev時のHMRで多重初期化しないようglobalThisへキャッシュする。
 */
type Services = {
  env: Env;
  db: Db;
  registry: ProjectRegistry;
  worktrees: WorktreeManager;
};

const globalStore = globalThis as unknown as { __crmServices?: Services };

export function services(): Services {
  if (!globalStore.__crmServices) {
    const env = getEnv();
    const { db } = openDb(env.DATABASE_PATH);
    const registry = ProjectRegistry.load(env.PROJECT_CONFIG_PATH);
    const worktrees = new WorktreeManager(createGitRunner(env.GIT_COMMAND), env.WORKTREE_ROOT);
    globalStore.__crmServices = { env, db, registry, worktrees };
  }
  return globalStore.__crmServices;
}
