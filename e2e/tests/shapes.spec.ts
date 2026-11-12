import { expect, test } from "@playwright/test";
import {
  CANVAS,
  EMPTY,
  block,
  blockIds,
  boxOf,
  dragMouse,
  drawRectangle,
  newBlockFrom,
  savedPosition,
  startAsGuest,
  typeLabel,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await startAsGuest(page);
});

test("typing in a shape gives it a label that moves with it", async ({ page }) => {
  const shape = await drawRectangle(page, CANVAS, { x: CANVAS.x + 200, y: CANVAS.y + 100 });
  await typeLabel(page, "API server");

  await expect(block(page, shape)).toContainText("API server");
  // the label is part of the shape, not a text block of its own
  expect(await blockIds(page)).toEqual([shape]);

  // grabbing the label drags the shape, label and all
  const before = await savedPosition(page, shape);
  const box = await boxOf(page, shape);
  await page.keyboard.press("v");
  await dragMouse(page, { x: box.cx, y: box.cy }, { x: box.cx + 120, y: box.cy + 60 });
  await expect.poll(() => savedPosition(page, shape)).toEqual({ left: before.left + 120, top: before.top + 60 });
  await expect(block(page, shape)).toContainText("API server");
});

test("undo takes back the last shape drawn", async ({ page }) => {
  const first = await drawRectangle(page, CANVAS, { x: CANVAS.x + 150, y: CANVAS.y + 80 });
  const second = await drawRectangle(page, { x: CANVAS.x + 300, y: CANVAS.y }, { x: CANVAS.x + 450, y: CANVAS.y + 80 });
  await page.mouse.click(EMPTY.x, EMPTY.y);

  await page.keyboard.press("Control+z");
  await expect(block(page, second)).toHaveCount(0);
  await expect(block(page, first)).toHaveCount(1);
});

test("the pen draws on top of a shape", async ({ page }) => {
  const shape = await drawRectangle(page, CANVAS, { x: CANVAS.x + 300, y: CANVAS.y + 200 });
  const stroke = await newBlockFrom(page, async () => {
    await page.keyboard.press("d");
    await dragMouse(page, { x: CANVAS.x + 60, y: CANVAS.y + 60 }, { x: CANVAS.x + 220, y: CANVAS.y + 140 }, 15);
  });
  expect(stroke).not.toBe(shape);
  // drawing over it didn't move the shape
  const box = await boxOf(page, shape);
  expect(Math.round(box.x)).toBe(CANVAS.x);
});
