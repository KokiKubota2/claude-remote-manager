import path from "node:path";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // リポジトリ直下の .env を読み込む(Next.jsが読むのはapps/web/.envのため)。
    // すでに設定済みの環境変数は上書きしない。
    try {
      process.loadEnvFile(path.join(process.cwd(), "..", "..", ".env"));
    } catch {
      // .env がなければ環境変数のみで動作する
    }
    const { jobManager } = await import("./lib/server/job-manager");
    jobManager();
  }
}
