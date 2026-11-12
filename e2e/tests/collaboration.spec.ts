import { expect, test } from "@playwright/test";
import { USER_STATE } from "../global-setup";
import { CANVAS, EMPTY, block, boxOf, dragMouse, drawRectangle, openNewServerCanvas, savedPosition, typeLabel } from "./helpers";

// Canvases on the server, so these run signed in (global-setup's account).
test.use({ storageState: USER_STATE });

test("a second tab sees shapes, labels, moves and deletes as they happen", async ({ page, context, request }) => {
  const id = await openNewServerCanvas(page, request);
  const other = await context.newPage();
  await other.goto(`/canvas/${id}`);
  await expect(other.getByTitle(/^Rectangle/)).toBeVisible();
  await page.bringToFront();

  // a new shape and its label
  const shape = await drawRectangle(page, CANVAS, { x: CANVAS.x + 200, y: CANVAS.y + 100 });
  await typeLabel(page, "Web app");
  await expect(block(other, shape)).toContainText("Web app");

  // a move
  const box = await boxOf(page, shape);
  await page.keyboard.press("v");
  await dragMouse(page, { x: box.x + 3, y: box.cy }, { x: box.x + 153, y: box.cy + 80 });
  const moved = await savedPosition(page, shape);
  await expect.poll(() => savedPosition(other, shape)).toEqual(moved);

  // a delete
  await page.mouse.click(EMPTY.x, EMPTY.y);
  const now = await boxOf(page, shape);
  await page.mouse.click(now.x + 3, now.cy);
  await page.keyboard.press("Delete");
  await expect(block(page, shape)).toHaveCount(0);
  await expect(block(other, shape)).toHaveCount(0);
});

test("a canvas on the server keeps its shapes after a reload", async ({ page, request }) => {
  await openNewServerCanvas(page, request);
  const shape = await drawRectangle(page, CANVAS, { x: CANVAS.x + 200, y: CANVAS.y + 100 });
  await typeLabel(page, "Saved");
  await expect(block(page, shape)).toContainText("Saved");
  const before = await savedPosition(page, shape);

  await page.reload();
  await expect(block(page, shape)).toContainText("Saved");
  expect(await savedPosition(page, shape)).toEqual(before);
});
