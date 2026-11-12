import { expect, test } from "@playwright/test";
import { CANVAS, block, drawRectangle, startAsGuest, typeLabel } from "./helpers";

test("a guest gets a canvas right away, and it's still there after a reload", async ({ page }) => {
  await startAsGuest(page);

  const shape = await drawRectangle(page, CANVAS, { x: CANVAS.x + 200, y: CANVAS.y + 100 });
  await typeLabel(page, "Kept in the browser");
  await expect(block(page, shape)).toContainText("Kept in the browser");

  await page.reload();
  await expect(block(page, shape)).toContainText("Kept in the browser");
});
