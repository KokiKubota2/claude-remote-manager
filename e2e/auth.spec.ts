import { expect, test } from "@playwright/test";
import { E2E_TOKEN } from "../playwright.config";

test.describe("認証(§29 シナリオF)", () => {
  test("未認証はログイン画面へリダイレクトされる", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByPlaceholder("WEB_AUTH_TOKEN")).toBeVisible();
  });

  test("誤ったトークンではエラーが表示される", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("WEB_AUTH_TOKEN").fill("wrong-token");
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page.getByText("認証に失敗しました")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("正しいトークンでダッシュボードへ入れる", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("WEB_AUTH_TOKEN").fill(E2E_TOKEN);
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page.getByRole("heading", { name: "Claude Remote" })).toBeVisible();
    await expect(page.getByRole("link", { name: "新しいタスク" })).toBeVisible();
  });
});
