import {
  blockCreatedEventSchema,
  blockUpdatedEventSchema,
  blocksStackedEventSchema,
} from "../schemas/socketEvents.schema";
import { MAX_CONTENT_LENGTH } from "../schemas/block.schema";

// Socket events are rebroadcast to everyone in the room, so they must hold to
// the same rules as the REST routes — otherwise the socket is a way around them.

describe("blockUpdatedEventSchema", () => {
  test("accepts what the client sends: content, language and an http(s) link", () => {
    const data = { id: "b1", content: "x", language: "python", link: "https://example.com" };
    expect(blockUpdatedEventSchema.parse(data)).toEqual(data);
  });

  test("rejects a link the REST route would reject", () => {
    for (const link of ["javascript:alert(1)", "data:text/html,hi", "not a url"]) {
      expect(blockUpdatedEventSchema.safeParse({ id: "b1", content: "", link }).success).toBe(false);
    }
  });

  test("relays a text block's size, and rejects sizes the REST route would", () => {
    const data = { id: "b1", content: "x", wrapWidth: 300, fontSize: 24 };
    expect(blockUpdatedEventSchema.parse(data)).toEqual(data);
    expect(blockUpdatedEventSchema.safeParse({ id: "b1", content: "", fontSize: 9999 }).success).toBe(false);
  });

  test("allows a size-only update without content (a resize doesn't resend it)", () => {
    expect(blockUpdatedEventSchema.parse({ id: "b1", wrapWidth: 300 })).toEqual({ id: "b1", wrapWidth: 300 });
  });

  test("drops fields that aren't part of the event instead of relaying them", () => {
    const parsed = blockUpdatedEventSchema.parse({ id: "b1", content: "", evil: "<img onerror>" });
    expect(parsed).not.toHaveProperty("evil");
  });

  test("leaves link out when the client didn't send one", () => {
    // the client checks `"link" in data` to decide whether to touch the link
    expect(blockUpdatedEventSchema.parse({ id: "b1", content: "" })).not.toHaveProperty("link");
  });

  test("rejects content over the size limit and unknown languages", () => {
    expect(blockUpdatedEventSchema.safeParse({ id: "b1", content: "a".repeat(MAX_CONTENT_LENGTH + 1) }).success).toBe(false);
    expect(blockUpdatedEventSchema.safeParse({ id: "b1", content: "", language: "ruby" }).success).toBe(false);
  });
});

describe("blockCreatedEventSchema", () => {
  test("accepts a full block row as returned by the API, keeping the fields the client uses", () => {
    const row = {
      id: "b1", canvas_id: "c1", type: "image", language: "javascript", content: "data:image/png;base64,AA",
      link: null, x: 1, y: 2, width: 300, created_at: "2026-10-04T00:00:00Z", updated_at: "2026-10-04T00:00:00Z",
    };
    expect(blockCreatedEventSchema.parse(row)).toEqual({
      id: "b1", type: "image", language: "javascript", content: "data:image/png;base64,AA", link: null, x: 1, y: 2, width: 300,
    });
  });

  test("rejects an unknown block type or a javascript: link", () => {
    expect(blockCreatedEventSchema.safeParse({ id: "b1", x: 0, y: 0, content: "", type: "banana" }).success).toBe(false);
    expect(blockCreatedEventSchema.safeParse({ id: "b1", x: 0, y: 0, content: "", link: "javascript:alert(1)" }).success).toBe(false);
  });
});

describe("blocksStackedEventSchema", () => {
  test("relays raised blocks with their new positions", () => {
    const parsed = blocksStackedEventSchema.safeParse([{ id: "b1", zIndex: 7, extra: "dropped" }]);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual([{ id: "b1", zIndex: 7 }]);
  });

  test("rejects an empty list and positions the REST route would refuse", () => {
    expect(blocksStackedEventSchema.safeParse([]).success).toBe(false);
    expect(blocksStackedEventSchema.safeParse([{ id: "b1", zIndex: -1 }]).success).toBe(false);
    expect(blocksStackedEventSchema.safeParse([{ id: "b1", zIndex: 1e300 }]).success).toBe(false);
  });

  test("a created block keeps its stacking position when relayed", () => {
    const block = { id: "b1", x: 0, y: 0, content: "", z_index: 1.7e12 };
    expect(blockCreatedEventSchema.parse(block)).toMatchObject({ z_index: 1.7e12 });
  });
});
