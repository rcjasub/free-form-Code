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
  flows: [
    {
      title: "Placing an order",
      steps: [
        { from: "web", to: "api", text: "The storefront sends the cart to the API." },
        { from: "orders", to: "db", text: "Orders saves the order in Postgres." },
      ],
    },
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

  test("while generating, the dialog shows each step as it runs", async ({ page, request }) => {
    const canvasId = await openNewServerCanvas(page, request);
    // hold the answer until the test lets it go
    let answer!: () => void;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    await page.route("**/api/canvases/*/architecture", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await answered;
      const { status, body } = ok(canvasId);
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });

    await openDialog(page);
    await page.getByLabel("GitHub repo").fill(REPO);
    await page.getByLabel("Anthropic API key").fill(API_KEY);
    await page.getByRole("button", { name: "Generate diagram" }).click();

    const progress = page.getByRole("list", { name: "Progress" });
    const step = (name: string) => progress.getByRole("listitem", { name: new RegExp(`^${name}:`) });
    // the form gives way to the steps
    await expect(page.getByLabel("GitHub repo")).toHaveCount(0);
    await expect(step("Read the repo")).toHaveAccessibleName("Read the repo: running");
    await expect(step("Claude maps it")).toHaveAccessibleName("Claude maps it: waiting");
    await page.screenshot({ path: "test-results/pipeline-reading.png" });

    // after the few seconds a read takes, Claude's step runs
    await expect(step("Claude maps it")).toHaveAccessibleName("Claude maps it: running", { timeout: 8000 });
    await expect(step("Read the repo")).toHaveAccessibleName("Read the repo: done");
    await page.waitForTimeout(700); // let the link fill in for the picture
    await page.screenshot({ path: "test-results/pipeline-thinking.png" });

    answer();
    await expect(page.getByRole("dialog")).toHaveCount(0);
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

    // grab the frame by its title band and drag it down-right (Alt: no
    // lining up with other boxes on the way, so it lands exactly there)
    const from = { x: before.frame.x + 12, y: before.frame.y + 12 };
    await page.keyboard.down("Alt");
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 60, from.y + 40, { steps: 8 });
    await page.mouse.move(from.x + 120, from.y + 80, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up("Alt");

    await expect.poll(() => where("Shop API")).toEqual({ x: before.frame.x + 120, y: before.frame.y + 80 });
    await expect.poll(() => where("Orders")).toEqual({ x: before.inner.x + 120, y: before.inner.y + 80 });
    expect(await where("Storefront")).toEqual(before.other);

    await page.mouse.click(EMPTY.x, EMPTY.y);
    await page.keyboard.press("Control+z");
    await expect.poll(() => where("Shop API")).toEqual(before.frame);
    await expect.poll(() => where("Orders")).toEqual(before.inner);
  });

  test("a box dropped into a group joins it, and one undo takes it back out", async ({ page, request }) => {
    const canvasId = await openNewServerCanvas(page, request);
    await fakeGenerate(page, ok(canvasId));
    await openDialog(page);
    await page.getByLabel("GitHub repo").fill(REPO);
    await page.getByLabel("Anthropic API key").fill(API_KEY);
    await page.getByRole("button", { name: "Generate diagram" }).click();
    await expect.poll(async () => (await blockIds(page)).length).toBe(DIAGRAM_BLOCKS);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".intro-in")).toHaveCount(0);

    const box = (title: string) => page.locator("[data-node-id]", { hasText: new RegExp(`^${title}$`) });
    const where = async (title: string) => {
      const b = (await box(title).boundingBox())!;
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
    };
    const frame = await where("Shop API");
    const orders = await where("Orders");
    const db = await where("Postgres");
    // make room: the frame grows down so Postgres fits under Orders
    const handle = page.locator("[data-node-id]", { hasText: /^Shop API$/ });
    await handle.click({ position: { x: 12, y: 12 } });
    const grow = db.h + 40;
    const corner = { x: frame.x + frame.w + 4, y: frame.y + frame.h + 4 };
    await page.mouse.move(corner.x, corner.y);
    await page.mouse.down();
    await page.mouse.move(corner.x + db.w, corner.y + grow, { steps: 8 });
    await page.mouse.up();
    await page.mouse.click(EMPTY.x, EMPTY.y);

    // drag Postgres in, under Orders: the frame lights up on the way
    const from = { x: db.x + 10, y: db.y + db.h / 2 };
    const to = { x: orders.x + 10, y: orders.y + orders.h + 30 + db.h / 2 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await expect(page.locator("[data-drop-target]")).toHaveCount(1);
    await page.mouse.up();
    await expect(page.locator("[data-drop-target]")).toHaveCount(0);
    // a block's move is saved (and its next move recorded for undo) once
    // it has settled for 300ms; a person doesn't grab the frame sooner
    await page.waitForTimeout(400);

    // now it travels with the frame
    const dbIn = await where("Postgres");
    const grab = { x: frame.x + 12, y: frame.y + 12 };
    await page.keyboard.down("Alt");
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x - 100, grab.y + 50, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up("Alt");
    await expect.poll(async () => (await where("Postgres")).x).toBe(dbIn.x - 100);

    // undo the frame's move, then the drop: Postgres is back out, and on its own again
    await page.mouse.click(EMPTY.x, EMPTY.y);
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await where("Postgres")).x).toBe(dbIn.x);
    await page.keyboard.press("Control+z");
    await expect.poll(async () => ({ x: (await where("Postgres")).x, y: (await where("Postgres")).y })).toEqual({ x: db.x, y: db.y });
    // (dragged back over the frame's spot, it isn't picked up)
    await page.keyboard.down("Alt");
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x - 100, grab.y, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up("Alt");
    await expect.poll(async () => (await where("Shop API")).x).toBe(frame.x - 100);
    expect((await where("Postgres")).x).toBe(db.x);
  });

  test("arrows inside a group stay hidden until one of their boxes is clicked", async ({ page, request }) => {
    const canvasId = await openNewServerCanvas(page, request);
    const grouped = {
      summary: "An API.",
      sections: [
        { id: "api", title: "Shop API", kind: "backend", summary: "The server.", files: [], parentId: null },
        { id: "auth", title: "Auth", kind: "backend", summary: "Sign in.", files: [], parentId: "api" },
        { id: "orders", title: "Orders", kind: "backend", summary: "Checkout.", files: [], parentId: "api" },
        { id: "db", title: "Postgres", kind: "db", summary: "Storage.", files: [], parentId: null },
      ],
      edges: [
        { from: "auth", to: "orders", label: "checks the user" },
        { from: "orders", to: "db", label: "SQL" },
      ],
      flows: [],
    };
    const reply = ok(canvasId);
    await fakeGenerate(page, { ...reply, body: { ...reply.body, architecture: { ...reply.body.architecture, model: grouped } } });
    await openDialog(page);
    await page.getByLabel("GitHub repo").fill(REPO);
    await page.getByLabel("Anthropic API key").fill(API_KEY);
    await page.getByRole("button", { name: "Generate diagram" }).click();
    await expect.poll(async () => (await blockIds(page)).length).toBe(6);
    await expect(page.locator(".intro-in")).toHaveCount(0);

    const inner = page.locator("[data-node-id]", { hasText: "checks the user" });
    const outer = page.locator("[data-node-id]", { hasText: /^SQL$/ });
    await expect(inner).toBeHidden();
    await expect(outer.locator("svg").first()).toBeVisible();

    // clicking Auth brings its wiring back
    const auth = (await page.locator("[data-node-id]", { hasText: /^Auth$/ }).boundingBox())!;
    await page.mouse.click(auth.x + 10, auth.y + auth.height / 2);
    await expect(inner.locator("svg").first()).toBeVisible();
    await page.mouse.click(EMPTY.x, EMPTY.y);
    await expect(inner).toBeHidden();

    // or switch them all on
    await page.getByRole("radiogroup", { name: "Inside groups" }).getByRole("radio", { name: "All" }).click();
    await expect(inner.locator("svg").first()).toBeVisible();
  });

  test("a flow plays step by step, lighting each step's boxes and arrow", async ({ page, request }) => {
    const canvasId = await openNewServerCanvas(page, request);
    await fakeGenerate(page, ok(canvasId));
    await openDialog(page);
    await page.getByLabel("GitHub repo").fill(REPO);
    await page.getByLabel("Anthropic API key").fill(API_KEY);
    await page.getByRole("button", { name: "Generate diagram" }).click();
    await expect.poll(async () => (await blockIds(page)).length).toBe(DIAGRAM_BLOCKS);
    await expect(page.locator(".intro-in")).toHaveCount(0);

    // with nothing lit, the diagram's arrow labels wait for a hover
    const label = page.getByText("SQL", { exact: true });
    await expect(label).toHaveCSS("opacity", "0");
    const labels = page.getByRole("radiogroup", { name: "Arrow labels" });
    await labels.getByRole("radio", { name: "All" }).click();
    await expect(label).toHaveCSS("opacity", "1");
    await labels.getByRole("radio", { name: "On hover" }).click();
    await expect(label).toHaveCSS("opacity", "0");

    await page.getByRole("navigation", { name: "Flows" }).getByRole("button", { name: /Placing an order/ }).click();
    const player = page.getByRole("region", { name: "Flow: Placing an order" });
    await expect(player).toContainText("The storefront sends the cart to the API.");
    await expect(player).toContainText(/Storefront.*Shop API/);

    const filterOf = (title: string) =>
      page.locator("[data-node-id]", { hasText: new RegExp(`^${title}$`) }).evaluate((el) => getComputedStyle(el).filter);
    await expect.poll(() => filterOf("Postgres")).toBe("opacity(0.25)");
    expect(await filterOf("Storefront")).toBe("none");
    await expect(page.locator("[data-flow-target]")).toHaveText("Shop API");
    await expect(page.locator("[data-flow]")).toHaveCount(1);

    // → for the next step: Orders to Postgres, its arrow lit and labelled
    await page.keyboard.press("ArrowRight");
    await expect(player).toContainText("Orders saves the order in Postgres.");
    await expect.poll(() => filterOf("Storefront")).toBe("opacity(0.25)");
    expect(await filterOf("Postgres")).toBe("none");
    await expect(page.locator("[data-flow-target]")).toHaveText("Postgres");
    await expect(label).toHaveCSS("opacity", "1");

    // Esc stops it, and everything's back
    await page.keyboard.press("Escape");
    await expect(player).toHaveCount(0);
    expect(await filterOf("Storefront")).toBe("none");
    await expect(page.locator("[data-flow-target]")).toHaveCount(0);
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
