import { expect, test, type Page } from "@playwright/test";
import { EMPTY, newBlockFrom, startAsGuest } from "./helpers";

// open canvas with room around it for the run button (left), the language
// picker (below) and the block growing
const SPOT = { x: 600, y: 300 };

test.beforeEach(async ({ page }) => {
  await startAsGuest(page);
});

const fontSize = (page: Page, selector: string) =>
  page.locator(selector).last().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

test("scaling a code block scales its run button and language picker gently with it", async ({ page }) => {
  // double-clicking empty canvas starts a text block. Just after the canvas
  // opens it's still loading and a double-click does nothing, so try again
  // until the new block's editor has the caret.
  const id = await newBlockFrom(page, async () => {
    await expect(async () => {
      await page.mouse.dblclick(SPOT.x, SPOT.y);
      await expect(page.locator(".cm-editor.cm-focused")).toBeVisible({ timeout: 1000 });
    }).toPass();
    await page.keyboard.type("print('hi')");
    await page.keyboard.press("Escape");
  });
  const block = page.locator(`[data-node-id="${id}"]`);

  // a runnable language, so it has a run button
  await page.getByRole("button", { name: "Block language" }).click();
  await page.getByRole("option", { name: "Python" }).click();
  await expect(block).toHaveAttribute("data-language", "python");

  const textFont = () => block.locator(".cm-content").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const before = { text: await textFont(), run: await fontSize(page, "[data-run]"), picker: await fontSize(page, "[data-language-picker]") };

  // select it, then drag the bottom-right dot out to about twice the size
  const box = (await block.boundingBox())!;
  await page.mouse.click(EMPTY.x, EMPTY.y);
  await page.mouse.click(box.x + 10, box.y + box.height / 2);
  const dot = (await page.getByTitle("Drag to resize the text").last().boundingBox())!;
  const from = { x: dot.x + dot.width / 2, y: dot.y + dot.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + box.width, from.y + box.height, { steps: 8 });
  await page.mouse.up();

  await expect.poll(textFont).toBeGreaterThan(before.text * 1.5);
  const scale = (await textFont()) / before.text;
  // both grew, but more gently than the text: by its scale to the 0.65
  // (CONTROLS_GROWTH in FloatingNode), each from its own default size
  const gentle = scale ** 0.65;
  expect((await fontSize(page, "[data-run]")) / before.run).toBeCloseTo(gentle, 1);
  expect((await fontSize(page, "[data-language-picker]")) / before.picker).toBeCloseTo(gentle, 1);

  // and the run button is still centered on the first line
  const run = (await page.locator("[data-run]").boundingBox())!;
  const firstLine = (await block.locator(".cm-line").first().boundingBox())!;
  expect(run.y + run.height / 2).toBeCloseTo(firstLine.y + firstLine.height / 2, -1);

  // the menu it opens keeps its usual size (text-xs: 0.75 of the 18px root)
  await page.getByRole("button", { name: "Block language" }).click();
  expect(await fontSize(page, '[role="listbox"]')).toBeCloseTo(13.5, 1);
});
