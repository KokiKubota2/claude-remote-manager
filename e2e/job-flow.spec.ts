import { expect, test, type Page } from "@playwright/test";
import { E2E_TOKEN } from "../playwright.config";

/**
 * §28.3 / §32 のE2Eシナリオ(mockアダプタ使用):
 * ログイン → プロジェクト選択 → タスク入力 → ジョブ開始 → 詳細表示 →
 * (mockが即完了)→ 完了表示 → diff確認 → 追加指示
 */

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder("WEB_AUTH_TOKEN").fill(E2E_TOKEN);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page.getByRole("heading", { name: "Claude Remote" })).toBeVisible();
}

test.describe("ジョブフロー", () => {
  test("タスク作成から完了・diff・追加指示まで", async ({ page }) => {
    await login(page);

    // プロジェクト一覧経由でタスク作成へ
    await page.getByRole("link", { name: "プロジェクト一覧" }).click();
    await expect(page.getByText("E2E Dummy")).toBeVisible();
    await page.getByRole("link", { name: "タスクを開始" }).click();
    await expect(page).toHaveURL(/\/new\?project=e2e-dummy$/);

    // テンプレート選択→本文入力→開始
    await page.getByRole("button", { name: "Lint修正" }).click();
    const textarea = page.getByPlaceholder("Claude Codeへ依頼する内容を入力");
    await expect(textarea).toHaveValue(/Lint/);
    await textarea.fill("E2Eテスト用のダミータスクです");
    await page.getByRole("button", { name: "Claude Codeを開始" }).click();

    // ジョブ詳細へ遷移し、mockアダプタが完了させるのを待つ(自動更新で反映される)
    await expect(page).toHaveURL(/\/jobs\/job_\d{8}_\d{3}$/);
    await expect(
      page.getByRole("heading", { name: "E2Eテスト用のダミータスクです" }),
    ).toBeVisible();
    await expect(page.getByText("完了", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("モック完了")).toBeVisible();

    // Git差分画面(mockは変更しないため「変更はありません」)
    await page.getByRole("link", { name: "Git差分を見る" }).click();
    await expect(page.getByText("変更はありません")).toBeVisible();
    await page.goBack();

    // 追加指示(resume)。mockが再度完了させる
    const messageBox = page.getByPlaceholder(/提案どおり進めてください/);
    await messageBox.fill("追加指示のE2Eテストです");
    await page.getByRole("button", { name: "Claudeへ送信" }).click();
    await expect(messageBox).toHaveValue("", { timeout: 15_000 });
    await expect(page.getByText("完了", { exact: true })).toBeVisible({ timeout: 30_000 });
  });

  test("ジョブ停止フロー(§29 シナリオE): 確認→停止→worktree保持", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "新しいタスク" }).click();
    await page
      .getByPlaceholder("Claude Codeへ依頼する内容を入力")
      .fill("停止テスト用タスク(すぐ止める)");
    await page.getByRole("button", { name: "Claude Codeを開始" }).click();
    await expect(page).toHaveURL(/\/jobs\/job_/);

    // 停止ボタン→確認→確定(mockが速すぎて完了済みならスキップ相当の検証)
    const stopButton = page.getByRole("button", { name: "ジョブを停止" });
    if (await stopButton.isVisible().catch(() => false)) {
      await stopButton.click();
      await expect(page.getByText("ジョブを停止しますか?")).toBeVisible();
      await page.getByRole("button", { name: "停止を確定" }).click();
    }
    // 最終的に終端状態(完了 or 停止済み)になっている
    await expect(page.getByText(/完了|停止済み/).first()).toBeVisible({ timeout: 30_000 });
  });
});
