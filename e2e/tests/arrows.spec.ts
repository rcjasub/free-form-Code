import { expect, test, type Page } from "@playwright/test";
import { EMPTY, block, boxOf, dragMouse, drawRectangle, newBlockFrom, startAsGuest } from "./helpers";

// Where an arrow's drawn line reaches, on screen: the box around its painted
// paths (not its invisible, wider hit area).
async function lineBox(page: Page, id: string) {
  return block(page, id).evaluate((el) => {
    let r: { left: number; right: number; top: number; bottom: number } | null = null;
    for (const p of el.querySelectorAll("svg path")) {
      if (p.getAttribute("stroke") === "transparent") continue;
      const b = p.getBoundingClientRect();
      if (!b.width && !b.height) continue;
      r = r
        ? { left: Math.min(r.left, b.left), right: Math.max(r.right, b.right), top: Math.min(r.top, b.top), bottom: Math.max(r.bottom, b.bottom) }
        : { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
    }
    return r!;
  });
}

test.beforeEach(async ({ page }) => {
  await startAsGuest(page);
});

test("an arrow between two shapes stays attached when one moves", async ({ page }) => {
  const from = await drawRectangle(page, { x: 400, y: 300 }, { x: 520, y: 380 });
  await page.mouse.click(EMPTY.x, EMPTY.y);
  const to = await drawRectangle(page, { x: 800, y: 300 }, { x: 920, y: 380 });
  await page.mouse.click(EMPTY.x, EMPTY.y);

  const arrow = await newBlockFrom(page, async () => {
    await page.keyboard.press("a");
    await dragMouse(page, { x: 460, y: 340 }, { x: 860, y: 340 });
  });

  // it starts on one shape's edge and ends on the other's
  let a = await boxOf(page, from);
  let b = await boxOf(page, to);
  let line = await lineBox(page, arrow);
  expect(Math.abs(line.left - a.right)).toBeLessThan(6);
  expect(Math.abs(line.right - b.x)).toBeLessThan(6);

  // move the second shape down and right: the arrow's end goes with it
  await page.keyboard.press("v");
  await page.mouse.click(EMPTY.x, EMPTY.y);
  await dragMouse(page, { x: b.cx, y: b.y + 2 }, { x: b.cx + 100, y: b.y + 162 });
  await expect.poll(async () => (await boxOf(page, to)).y).toBeGreaterThan(b.y + 150);

  a = await boxOf(page, from);
  b = await boxOf(page, to);
  await expect.poll(async () => Math.abs((await lineBox(page, arrow)).right - b.x)).toBeLessThan(6);
  line = await lineBox(page, arrow);
  expect(Math.abs(line.left - a.right)).toBeLessThan(6);
  expect(line.bottom).toBeGreaterThan(a.cy + 40); // it now slopes down to the moved shape
});

test("double-clicking an arrow labels it", async ({ page }) => {
  const arrow = await newBlockFrom(page, async () => {
    await page.keyboard.press("a");
    await dragMouse(page, { x: 450, y: 400 }, { x: 800, y: 400 });
  });
  await page.keyboard.press("v");
  await page.mouse.click(EMPTY.x, EMPTY.y);

  await page.mouse.dblclick(625, 400);
  await page.keyboard.type("calls the API");
  await page.mouse.click(EMPTY.x, EMPTY.y);

  await expect(block(page, arrow)).toContainText("calls the API");
});
