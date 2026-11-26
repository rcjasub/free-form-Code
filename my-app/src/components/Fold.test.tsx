import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { FoldBody } from "./Fold";

afterEach(cleanup);

describe("FoldBody", () => {
  test("a card that starts open shows its body right away, without sliding in", () => {
    const { getByText, container } = render(<FoldBody open>key</FoldBody>);
    expect(getByText("key")).toBeTruthy();
    expect(container.querySelector<HTMLElement>("[data-fold-body]")!.style.height).not.toBe("0px");
  });

  test("a folded card has no body", () => {
    const { queryByText } = render(<FoldBody open={false}>key</FoldBody>);
    expect(queryByText("key")).toBeNull();
  });

  test("closing slides the body shut and then removes it; opening brings it back", async () => {
    const { queryByText, rerender, container } = render(<FoldBody open>key</FoldBody>);
    rerender(<FoldBody open={false}>key</FoldBody>);
    // still there, clipped, while it slides shut
    expect(container.querySelector<HTMLElement>("[data-fold-body]")?.style.overflow).toBe("hidden");
    await waitFor(() => expect(queryByText("key")).toBeNull());

    rerender(<FoldBody open>key</FoldBody>);
    expect(queryByText("key")).toBeTruthy();
  });
});
