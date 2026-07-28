import "server-only";
import { getEnv, type Env } from "@claude-remote/core/config";
import { ProjectRegistry } from "@claude-remote/core/config";
import { openDb, type Db } from "@claude-remote/core/db";

/**
 * Next.jsサーバープロセス内のシングルトン。
 * dev時のHMRで多重初期化しないようglobalThisへキャッシュする。
 */
type Services = {
  env: Env;
  db: Db;
  registry: ProjectRegistry;
};

const globalStore = globalThis as unknown as { __crmServices?: Services };

export function services(): Services {
  if (!globalStore.__crmServices) {
    const env = getEnv();
    const { db } = openDb(env.DATABASE_PATH);
    const registry = ProjectRegistry.load(env.PROJECT_CONFIG_PATH);
    globalStore.__crmServices = { env, db, registry };
  }
  return globalStore.__crmServices;
}
