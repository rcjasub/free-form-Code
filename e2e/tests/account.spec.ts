import { expect, test } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { USER_STATE } from "../global-setup";

// Sign-up, sign-in and deleting an account share a rate limit (10 per 2
// minutes per IP), so the account's whole life is one test, and the dialog
// test uses the run's shared account without deleting it.

// What the dialog says goes with the account, for this many canvases.
const losing = (canvases: number) =>
  canvases === 1 ? "your account and your canvas" : `your account and all ${canvases} of your canvases`;

test("an account's whole life: sign up, make a canvas, then delete it all from the dashboard", async ({ page, browser, baseURL }) => {
  const username = `e2e_${Date.now()}`;
  // made up fresh every run: no password lives in the repo
  const password = randomBytes(18).toString("base64url");

  // sign up, and land on the dashboard
  await page.goto("/");
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByPlaceholder("Username").fill(username);
  await page.getByPlaceholder("Email").fill(`${username}@example.com`);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // make a canvas and open it
  await page.getByRole("button", { name: /New canvas/ }).first().click();
  await page.getByPlaceholder("Canvas name").fill("Architecture");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page).toHaveURL(/\/canvas\/[0-9a-f-]{36}$/);
  await expect(page.getByTitle(/^Rectangle/)).toBeVisible();
  const canvasId = page.url().split("/").pop()!;
  const { share_id: shareId } = await (await page.request.get(`/api/canvases/${canvasId}`)).json();
  const canvases = (await (await page.request.get("/api/canvases")).json()).length;

  // signed in on another device too
  const other = await browser.newContext({ baseURL });
  const signIn = await other.request.post("/api/auth/login", { data: { email: `${username}@example.com`, password } });
  expect(signIn.ok(), "sign in on the other device").toBeTruthy();

  // the dialog says what goes with it
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(losing(canvases));
  await expect(dialog).toContainText("This can't be undone.");
  const confirm = dialog.getByRole("button", { name: "Delete account" });

  // a wrong password is refused, and nothing is deleted
  await dialog.getByPlaceholder("Password").fill(`${password}-wrong`);
  await confirm.click();
  await expect(dialog.getByRole("alert")).toHaveText("That password isn't right.");
  expect((await (await page.request.get("/api/auth/me")).json()).user).not.toBeNull();

  // the right one deletes it, and signs this browser out
  await dialog.getByPlaceholder("Password").fill(password);
  await confirm.click();
  await expect(page).toHaveURL(/\/$/);
  expect((await (await page.request.get("/api/auth/me")).json()).user).toBeNull();

  // the canvas and its share link are gone
  expect((await other.request.get(`/api/canvases/share/${shareId}`)).status()).toBe(404);

  // the other device is signed out at its next page load
  expect((await (await other.request.get("/api/auth/me")).json()).user).toBeNull();
  const otherPage = await other.newPage();
  await otherPage.goto("/dashboard");
  await expect(otherPage).toHaveURL(/\/$/);
  await other.close();
});

test.describe("the delete-account dialog", () => {
  // the run's shared account; nothing here deletes it
  test.use({ storageState: USER_STATE });

  test("needs the password, and closes without deleting anything", async ({ page }) => {
    await page.goto("/dashboard");
    const open = page.getByRole("button", { name: "Delete account" });
    await open.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // nothing to submit without a password
    const confirm = dialog.getByRole("button", { name: "Delete account" });
    await expect(confirm).toBeDisabled();
    await dialog.getByPlaceholder("Password").fill("typed but not sent");
    await expect(confirm).toBeEnabled();

    // Escape closes it; it opens again empty
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await open.click();
    await expect(dialog.getByPlaceholder("Password")).toHaveValue("");

    // so does Cancel
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    // still signed in, still there
    expect((await (await page.request.get("/api/auth/me")).json()).user).not.toBeNull();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
