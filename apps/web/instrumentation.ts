import path from "node:path";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const repoRoot = path.resolve(process.cwd(), "..", "..");
    // 相対パス設定(./config等)をリポジトリルート基準で解決させる
    if (!process.env.CRM_BASE_DIR) process.env.CRM_BASE_DIR = repoRoot;
    // リポジトリ直下の .env を読み込む(Next.jsが読むのはapps/web/.envのため)。
    // すでに設定済みの環境変数は上書きしない。
    try {
      process.loadEnvFile(path.join(repoRoot, ".env"));
    } catch {
      // .env がなければ環境変数のみで動作する
    }
    const { jobManager } = await import("./lib/server/job-manager");
    jobManager();
  }
}
