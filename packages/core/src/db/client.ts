import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { MIGRATIONS } from "./migrations";

export type Db = BetterSQLite3Database<typeof schema>;

export function openDb(databasePath: string): { db: Db; sqlite: Database.Database } {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  applyMigrations(sqlite);
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

/** user_version pragmaで管理する軽量マイグレーション */
export function applyMigrations(sqlite: Database.Database): void {
  const current = sqlite.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    const migration = MIGRATIONS[v];
    if (!migration) continue;
    const run = sqlite.transaction(() => {
      sqlite.exec(migration.sql);
      sqlite.pragma(`user_version = ${v + 1}`);
    });
    run();
  }
}
