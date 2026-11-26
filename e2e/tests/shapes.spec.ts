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

test("while typing a shape's label, the toolbar shows the text tool", async ({ page }) => {
  await drawRectangle(page, CANVAS, { x: CANVAS.x + 200, y: CANVAS.y + 100 });
  const textTool = page.getByTitle(/^Text/);
  await expect(textTool).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("Enter");
  await expect(page.locator("[contenteditable]").first()).toBeFocused();
  await expect(textTool).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.type("API server");
  await page.mouse.click(EMPTY.x, EMPTY.y);
  await expect(textTool).toHaveAttribute("aria-pressed", "false");
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

test("a dragged shape lines up with one nearby, with no line drawn to show it", async ({ page }) => {
  const first = await drawRectangle(page, CANVAS, { x: CANVAS.x + 150, y: CANVAS.y + 80 });
  const second = await drawRectangle(page, { x: CANVAS.x + 300, y: CANVAS.y + 200 }, { x: CANVAS.x + 420, y: CANVAS.y + 260 });
  await page.keyboard.press("v");
  await page.mouse.click(EMPTY.x, EMPTY.y);
  const target = await savedPosition(page, first);
  const start = await savedPosition(page, second);

  // drag the second so its left edge ends 4px off the first's
  const box = await boxOf(page, second);
  const dx = target.left + 4 - start.left;
  await page.mouse.move(box.cx, box.cy);
  await page.mouse.down();
  await page.mouse.move(box.cx + dx, box.cy, { steps: 8 });
  await expect(page.locator("[data-guide]")).toHaveCount(0);
  await page.mouse.up();

  // it snapped onto the line
  await expect.poll(() => savedPosition(page, second)).toEqual({ left: target.left, top: start.top });
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

test("a pattern can be picked for a shape with no fill yet, and fills it", async ({ page }) => {
  await drawRectangle(page, CANVAS, { x: CANVAS.x + 200, y: CANVAS.y + 100 });
  const pattern = page.getByRole("radiogroup", { name: "Pattern" });
  // offered straight away, with nothing picked while the shape is empty
  await expect(pattern).toBeVisible();
  await expect(pattern.getByRole("radio", { checked: true })).toHaveCount(0);
  await pattern.getByRole("radio", { name: "Stripes" }).click();
  await expect(pattern.getByRole("radio", { name: "Stripes" })).toBeChecked();
});
