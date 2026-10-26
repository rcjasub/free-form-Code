import { useCallback, useEffect, useRef, useState } from "react";

// One tab at a time on the browser-only canvas (like WhatsApp Web). Two tabs
// would each keep their own copy in memory and save over each other, and
// "Move online" in one would leave the other's blocks behind. The tab holding
// the Web Lock is the canvas; any other shows "open in another tab" and can
// take over, which makes the old tab step aside.

const NAME = "free-form:local-canvas";
// The old tab's debounced saves (up to 800ms for typing) still run after it
// steps aside; the lock is handed over once they've had time to finish.
const SAVE_SETTLE_MS = 1500;

type Message = { type: "take-over" } | { type: "moved"; canvasId: string };

// checking: asking for the lock. waiting: took over, old tab still saving.
export type TabState = "checking" | "active" | "elsewhere" | "waiting";

// Tells tabs left on the browser canvas that it was moved online.
export function announceMoved(canvasId: string): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(NAME);
  channel.postMessage({ type: "moved", canvasId } satisfies Message);
  channel.close();
}

export function useActiveTab() {
  // Without these (very old browsers) every tab works as before.
  const supported = typeof navigator !== "undefined" && !!navigator.locks && typeof BroadcastChannel !== "undefined";
  const [state, setState] = useState<TabState>(supported ? "checking" : "active");
  // where the canvas went, if another tab moved it online
  const [movedTo, setMovedTo] = useState<string | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const release = useRef<(() => void) | null>(null);
  const waiting = useRef<AbortController | null>(null);
  const alive = useRef(true);

  // The lock callback: keeps the lock until `release` is called.
  const hold = useCallback((lock: Lock | null) => {
    if (!alive.current) return;
    if (!lock) {
      setState("elsewhere");
      return;
    }
    setState("active");
    return new Promise<void>((resolve) => {
      release.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (!supported) return;
    alive.current = true;
    const ch = new BroadcastChannel(NAME);
    channel.current = ch;
    ch.onmessage = (e: MessageEvent<Message>) => {
      if (e.data.type === "moved") {
        setMovedTo(e.data.canvasId);
        return;
      }
      // Another tab took over. One still waiting for its turn backs off too,
      // so the latest click wins.
      if (waiting.current) {
        waiting.current.abort();
        waiting.current = null;
        setState("elsewhere");
      }
      const done = release.current;
      if (done) {
        release.current = null;
        setState("elsewhere");
        setTimeout(done, SAVE_SETTLE_MS);
      }
    };
    navigator.locks.request(NAME, { ifAvailable: true }, hold).catch(() => {});

    return () => {
      alive.current = false;
      ch.close();
      waiting.current?.abort();
      release.current?.();
      release.current = null;
    };
  }, [supported, hold]);

  const takeOver = useCallback(() => {
    channel.current?.postMessage({ type: "take-over" } satisfies Message);
    const ctrl = new AbortController();
    waiting.current = ctrl;
    setState("waiting");
    navigator.locks
      .request(NAME, { signal: ctrl.signal }, (lock) => {
        waiting.current = null;
        return hold(lock);
      })
      .catch(() => {}); // aborted: another tab took over first
  }, [hold]);

  return { state, movedTo, takeOver };
}
