import { expect, type APIRequestContext, type Page } from "@playwright/test";

// Shared steps for the canvas tests. Everything is driven the way a person
// would: the mouse, the keyboard, the buttons on screen.

// Away from the properties panel on the left (x ≈ 68–312) and the toolbar
// at the top, so drags land on the canvas itself.
export const CANVAS = { x: 450, y: 220 };
// a spot that's always empty canvas, for clicking away
export const EMPTY = { x: 1150, y: 720 };

// Puts the mouse on the canvas and waits for the side menu to be closed.
// The menu opens while hovered and pushes the properties panel over the
// canvas (to x ≈ 283–527). A headless Linux browser starts with the mouse
// at (0, 0), on the menu, so it opens before the test does anything, and it
// takes ~400ms to close again: a drag started sooner lands on the panel.
export async function mouseOnCanvas(page: Page) {
  await page.mouse.move(EMPTY.x, EMPTY.y);
  const menu = page.getByRole("navigation").first();
  if (await menu.count()) {
    await expect.poll(async () => (await menu.boundingBox())?.width ?? 0, { message: "the side menu closes" }).toBeLessThan(60);
  }
}

// Opens a canvas that lives in this browser, as someone without an account.
export async function startAsGuest(page: Page) {
  await page.goto("/");
  await page.getByText("Try without an account").click();
  await expect(page).toHaveURL(/\/canvas\/local$/);
  await expect(page.getByTitle(/^Rectangle/)).toBeVisible();
  await mouseOnCanvas(page);
}

// Makes a canvas on the server for the signed-in test account and opens it.
export async function openNewServerCanvas(page: Page, request: APIRequestContext, name = "e2e canvas") {
  const res = await request.post("/api/canvases", { data: { name } });
  expect(res.ok(), `create canvas: ${res.status()}`).toBeTruthy();
  const canvas = await res.json();
  const id: string = canvas.id ?? canvas.canvas?.id;
  await page.goto(`/canvas/${id}`);
  await expect(page.getByTitle(/^Rectangle/)).toBeVisible();
  await mouseOnCanvas(page);
  return id;
}

export const block = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);

export async function blockIds(page: Page): Promise<string[]> {
  return page.$$eval("[data-node-id]", (els) => els.map((e) => e.getAttribute("data-node-id")!));
}

// Runs `act` and returns the id of the one block it made.
export async function newBlockFrom(page: Page, act: () => Promise<void>): Promise<string> {
  const before = new Set(await blockIds(page));
  await act();
  let id: string | undefined;
  await expect
    .poll(async () => {
      id = (await blockIds(page)).find((i) => !before.has(i));
      return id;
    })
    .toBeTruthy();
  return id!;
}

export async function dragMouse(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 10) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

// Draws a rectangle with the rectangle tool (R) from one corner to the other.
export async function drawRectangle(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  return newBlockFrom(page, async () => {
    await page.keyboard.press("r");
    await dragMouse(page, from, to);
  });
}

// Types a label into the selected shape (Enter starts typing) and finishes.
export async function typeLabel(page: Page, text: string) {
  await page.keyboard.press("Enter");
  await expect(page.locator("[contenteditable]").first()).toBeFocused();
  await page.keyboard.type(text);
  await page.mouse.click(EMPTY.x, EMPTY.y);
}

export async function boxOf(page: Page, id: string) {
  const b = await block(page, id).boundingBox();
  expect(b, `block ${id} on screen`).not.toBeNull();
  return { ...b!, cx: b!.x + b!.width / 2, cy: b!.y + b!.height / 2, right: b!.x + b!.width, bottom: b!.y + b!.height };
}

// The canvas position a block is saved at (its style left/top).
export async function savedPosition(page: Page, id: string) {
  return block(page, id).evaluate((el) => ({ left: parseFloat(el.style.left), top: parseFloat(el.style.top) }));
}
