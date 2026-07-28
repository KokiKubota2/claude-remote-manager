import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** 初期セットアップ: .env と config/projects.yaml の雛形を作る */

const repoDir = path.resolve(import.meta.dirname, "..");

const envPath = path.join(repoDir, ".env");
if (!fs.existsSync(envPath)) {
  const example = fs.readFileSync(path.join(repoDir, ".env.example"), "utf8");
  const withToken = example.replace(/^WEB_AUTH_TOKEN=$/m, `WEB_AUTH_TOKEN=${randomBytes(32).toString("hex")}`);
  fs.writeFileSync(envPath, withToken);
  console.log(".env を作成しました(WEB_AUTH_TOKENを自動生成)");
} else {
  console.log(".env は既に存在します(変更なし)");
}

const projectsPath = path.join(repoDir, "config", "projects.yaml");
if (!fs.existsSync(projectsPath)) {
  fs.copyFileSync(path.join(repoDir, "config", "projects.example.yaml"), projectsPath);
  console.log("config/projects.yaml を作成しました(対象リポジトリを編集してください)");
} else {
  console.log("config/projects.yaml は既に存在します(変更なし)");
}

console.log("\n次のステップ:");
console.log("1. config/projects.yaml に対象リポジトリを登録する");
console.log("2. (任意) .env にSlackトークンを設定する");
console.log("3. pnpm doctor で環境を確認する");
console.log("4. pnpm build && pnpm start で起動する");
