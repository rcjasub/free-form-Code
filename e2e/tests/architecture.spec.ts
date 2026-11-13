import { randomBytes } from "crypto";
import { expect, test, type Page, type Request } from "@playwright/test";
import { USER_STATE } from "../global-setup";
import { EMPTY, blockIds, mouseOnCanvas, openNewServerCanvas, startAsGuest } from "./helpers";

// "Visualize repo" (Phase 2): the dialog, the request it sends, and the
// diagram it draws. The AI call itself is replaced in the browser with a
// fixed answer, so these never reach GitHub or Anthropic and cost nothing;
// the backend side is covered by its own tests.

// Made up per run: no key-shaped literal lives in the repo.
const API_KEY = `sk-ant-api03-${randomBytes(30).toString("base64url")}`;
const REPO = "https://github.com/acme/shop";

const model = {
  summary: "A small shop.",
  sections: [
    { id: "web", title: "Storefront", kind: "frontend", summary: "The site.", files: ["web/"], parentId: null },
    { id: "api", title: "Shop API", kind: "backend", summary: "The server.", files: ["api/"], parentId: null },
    { id: "orders", title: "Orders", kind: "backend", summary: "Checkout.", files: ["api/orders.ts"], parentId: "api" },
    { id: "db", title: "Postgres", kind: "db", summary: "Storage.", files: [], parentId: null },
  ],
  edges: [
    { from: "web", to: "api", label: "REST" },
    { from: "orders", to: "db", label: "SQL" },
    // a group to its own child: not drawn
    { from: "api", to: "orders", label: "" },
  ],
};
// 4 shapes and 2 arrows
const DIAGRAM_BLOCKS = 6;

// Answers the generate request with `reply`, recording what was sent.
async function fakeGenerate(page: Page, reply: { status: number; body: unknown }) {
  const sent: Request[] = [];
  await page.route("**/api/canvases/*/architecture", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    sent.push(route.request());
    await route.fulfill({ status: reply.status, contentType: "application/json", body: JSON.stringify(reply.body) });
  });
  return sent;
}

const ok = (canvasId: string) => ({
  status: 201,
  body: {
    architecture: { id: "arch-1", canvas_id: canvasId, repo_url: REPO, commit_sha: "a".repeat(40), model, created_at: new Date().toISOString() },
    warnings: [],
    servedBy: "claude-opus-5-5",
  },
});

async function openDialog(page: Page) {
  await page.getByTitle("Draw a GitHub repo's architecture").click();
  await expect(page.getByRole("dialog", { name: "Visualize a repo" })).toBeVisible();
}

test.describe("signed in", () => {
  test.use({ storageState: USER_STATE });

  test("draws the AI's diagram on the canvas, saved, as one undo step", async ({ page, request }) => {
    const canvasId = await openNewServerCanvas(page, request);
    const sent = await fakeGenerate(page, ok(canvasId));

    await openDialog(page);
    await page.getByLabel("GitHub repo").fill(REPO);
    await page.getByRole("radio", { name: /Opus/ }).click();
    await page.getByRole("radio", { name: /Detailed/ }).click();
    await page.getByLabel("Anthropic API key").fill(API_KEY);
    await page.getByRole("button", { name: "Generate diagram" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(async () => (await blockIds(page)).length).toBe(DIAGRAM_BLOCKS);
    for (const title of ["Storefront", "Shop API", "Orders", "Postgres", "REST", "SQL"]) {
      await expect(page.getByText(title, { exact: true })).toBeVisible();
    }

    // The key travels in a header, never in the body.
    expect(sent).toHaveLength(1);
    expect(sent[0].headers()["x-anthropic-key"]).toBe(API_KEY);
    expect(sent[0].postDataJSON()).toEqual({ repoUrl: REPO, model: "claude-opus-5-5", detail: "detailed" });

    // Saved on the server: still there after a reload.
    await page.reload();
    await mouseOnCanvas(page);
    await expect.poll(async () => (await blockIds(page)).length).toBe(DIAGRAM_BLOCKS);

    // One undo removes all of it (undo history starts with the page, so draw
    // a second one to take back).
    await openDialog(page);
    await page.getByRole("button", { name: "Generate diagram" }).click();
    await expect.poll(async () => (await blockIds(page)).length).toBe(2 * DIAGRAM_BLOCKS);
    await page.mouse.click(EMPTY.x, EMPTY.y);
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await blockIds(page)).length).toBe(DIAGRAM_BLOCKS);
  });

  test("clicking a box shows what it is, its files on GitHub and what it connects to", async ({ page, request }) => {
    const canvasId = await openNewServerCanvas(page, request);
    await fakeGenerate(page, ok(canvasId));
    await openDialog(page);
    await page.getByLabel("GitHub repo").fill(REPO);
    await page.getByLabel("Anthropic API key").fill(API_KEY);
    await page.getByRole("button", { name: "Generate diagram" }).click();
    await expect.poll(async () => (await blockIds(page)).length).toBe(DIAGRAM_BLOCKS);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // each box shows its kind's icon
    await expect(page.locator("[data-node-id]", { hasText: /^Postgres$/ }).locator("svg.lucide-database")).toHaveCount(1);
    await expect(page.locator("[data-node-id]", { hasText: /^Storefront$/ }).locator("svg.lucide-monitor")).toHaveCount(1);

    // click the box, where a person would (its label lets clicks through)
    const postgres = await page.locator("[data-node-id]", { hasText: /^Postgres$/ }).boundingBox();
    await page.mouse.click(postgres!.x + 10, postgres!.y + postgres!.height / 2);
    const card = page.getByRole("complementary", { name: "About Postgres" });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Database");
    await expect(card).toContainText("Storage.");
    // the rest of the canvas dims, except what it connects to
    const filterOf = (title: string) =>
      page.locator("[data-node-id]", { hasText: new RegExp(`^${title}$`) }).evaluate((el) => getComputedStyle(el).filter);
    await expect.poll(() => filterOf("Storefront")).toBe("opacity(0.25)");
    expect(await filterOf("Orders")).toBe("none");
    expect(await filterOf("Postgres")).toBe("none");
    // its one arrow (Orders → Postgres) runs with moving dashes; the head
    // doesn't (once the diagram has finished building itself in)
    await expect(page.locator(".intro-in")).toHaveCount(0);
    await expect(page.locator("[data-flow]")).toHaveCount(1);
    expect(await page.locator("[data-flow] path:not([data-arrow-head])").first().evaluate((p) => getComputedStyle(p).animationName)).toBe("arrow-flow");
    expect(await page.locator("[data-flow] path[data-arrow-head]").first().evaluate((p) => getComputedStyle(p).animationName)).toBe("none");
    // Orders → Postgres (SQL)
    await card.getByRole("button", { name: /Orders/ }).click();

    const orders = page.getByRole("complementary", { name: "About Orders" });
    await expect(orders).toBeVisible();
    await expect(orders.getByRole("link", { name: "api/orders.ts" })).toHaveAttribute(
      "href",
      `${REPO}/blob/${"a".repeat(40)}/api/orders.ts`,
    );

    // clicking empty canvas closes it
    await page.mouse.click(EMPTY.x, EMPTY.y);
    await expect(page.getByRole("complementary", { name: /^About / })).toHaveCount(0);
    expect(await filterOf("Storefront")).toBe("none");
    // with nothing selected, a key to the colors
    await expect(page.getByRole("list", { name: "Diagram key" })).toContainText("Database");
  });

  test("dragging a group's frame brings what's inside it, and one undo puts it back", async ({ page, request }) => {
    const canvasId = await openNewServerCanvas(page, request);
    await fakeGenerate(page, ok(canvasId));
    await openDialog(page);
    await page.getByLabel("GitHub repo").fill(REPO);
    await page.getByLabel("Anthropic API key").fill(API_KEY);
    await page.getByRole("button", { name: "Generate diagram" }).click();
    await expect.poll(async () => (await blockIds(page)).length).toBe(DIAGRAM_BLOCKS);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // measured once the diagram has finished building itself in (it slides up into place)
    await expect(page.locator(".intro-in")).toHaveCount(0);
    const box = (title: string) => page.locator("[data-node-id]", { hasText: new RegExp(`^${title}$`) });
    const where = async (title: string) => {
      const b = (await box(title).boundingBox())!;
      return { x: Math.round(b.x), y: Math.round(b.y) };
    };
    const before = { frame: await where("Shop API"), inner: await where("Orders"), other: await where("Storefront") };

    // grab the frame by its title band and drag it down-right
    const from = { x: before.frame.x + 12, y: before.frame.y + 12 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 60, from.y + 40, { steps: 8 });
    await page.mouse.move(from.x + 120, from.y + 80, { steps: 8 });
    await page.mouse.up();

    await expect.poll(() => where("Shop API")).toEqual({ x: before.frame.x + 120, y: before.frame.y + 80 });
    await expect.poll(() => where("Orders")).toEqual({ x: before.inner.x + 120, y: before.inner.y + 80 });
    expect(await where("Storefront")).toEqual(before.other);

    await page.mouse.click(EMPTY.x, EMPTY.y);
    await page.keyboard.press("Control+z");
    await expect.poll(() => where("Shop API")).toEqual(before.frame);
    await expect.poll(() => where("Orders")).toEqual(before.inner);
  });

  test("shows what went wrong and adds nothing", async ({ page, request }) => {
    await openNewServerCanvas(page, request);
    const message = "Anthropic rejected the API key. Check it's correct and still active.";
    await fakeGenerate(page, { status: 422, body: { error: message, code: "bad_key" } });

    await openDialog(page);
    await page.getByLabel("GitHub repo").fill(REPO);
    await page.getByLabel("Anthropic API key").fill(API_KEY);
    await page.getByRole("button", { name: "Generate diagram" }).click();

    await expect(page.getByRole("alert")).toHaveText(message);
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await blockIds(page)).toEqual([]);
  });

  test("remembers the key in this browser until it's forgotten", async ({ page, request }) => {
    await openNewServerCanvas(page, request);
    await fakeGenerate(page, { status: 422, body: { error: "Nope.", code: "bad_key" } });

    await openDialog(page);
    await page.getByLabel("GitHub repo").fill(REPO);
    await page.getByLabel("Anthropic API key").fill(API_KEY);
    await page.getByRole("button", { name: "Generate diagram" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    await openDialog(page);
    await expect(page.getByLabel("Anthropic API key")).toHaveValue(API_KEY);
    await expect(page.getByLabel("GitHub repo")).toHaveValue(REPO);
    await page.getByRole("button", { name: "Forget it" }).click();
    await expect(page.getByLabel("Anthropic API key")).toHaveValue("");
    await page.getByRole("button", { name: "Cancel" }).click();
    await openDialog(page);
    await expect(page.getByLabel("Anthropic API key")).toHaveValue("");
  });
});

test("a guest is asked to sign up instead", async ({ page }) => {
  await startAsGuest(page);
  await page.getByTitle("Sign up to draw a repo's architecture").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("dialog", { name: "Visualize a repo" })).toHaveCount(0);
});
