import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createKeyedThrottle } from "./throttle";

describe("createKeyedThrottle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("runs the first call right away", () => {
    const throttle = createKeyedThrottle(40);
    const fn = vi.fn();
    throttle("a", fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("collapses calls inside the window into one trailing call with the latest value", () => {
    const throttle = createKeyedThrottle(40);
    const seen: number[] = [];
    throttle("a", () => seen.push(1));
    throttle("a", () => seen.push(2));
    throttle("a", () => seen.push(3));
    expect(seen).toEqual([1]);
    vi.advanceTimersByTime(40);
    expect(seen).toEqual([1, 3]); // the last value is never dropped
  });

  test("force runs immediately and cancels the pending trailing call", () => {
    const throttle = createKeyedThrottle(40);
    const seen: string[] = [];
    throttle("a", () => seen.push("first"));
    throttle("a", () => seen.push("stale"));
    throttle("a", () => seen.push("final"), true);
    vi.advanceTimersByTime(100);
    expect(seen).toEqual(["first", "final"]);
  });

  test("keys are throttled independently", () => {
    const throttle = createKeyedThrottle(40);
    const a = vi.fn();
    const b = vi.fn();
    throttle("a", a);
    throttle("b", b);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
