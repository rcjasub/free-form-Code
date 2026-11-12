import { expect, test } from "@playwright/test";
import { randomBytes } from "node:crypto";

test("signing up leads to the dashboard, where a new canvas can be made and opened", async ({ page }) => {
  const username = `e2e_${Date.now()}`;
  // made up fresh every run: no password lives in the repo
  const password = randomBytes(18).toString("base64url");
  await page.goto("/");
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByPlaceholder("Username").fill(username);
  await page.getByPlaceholder("Email").fill(`${username}@example.com`);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("button", { name: /New canvas/ }).first().click();
  await page.getByPlaceholder("Canvas name").fill("Architecture");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page).toHaveURL(/\/canvas\/[0-9a-f-]{36}$/);
  await expect(page.getByTitle(/^Rectangle/)).toBeVisible();
});
