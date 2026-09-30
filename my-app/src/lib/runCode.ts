import type { Socket } from "socket.io-client";

export interface RunOutput {
  output: string;
  error: boolean;
}

// Longer than the backend's worst case (queue wait + 10s compile + 3s run), so
// this only fires if the result is truly lost — and the listener never leaks.
const RESULT_TIMEOUT_MS = 30000;

// Sends code to /api/run and resolves with its output. The output arrives over
// the socket tagged with the runId we sent, so concurrent runs can't pick up
// each other's results. If the request itself is rejected (rate limit, invalid
// input) no socket event will come, so the HTTP error is returned instead.
export function requestRun(socket: Socket, code: string, language: string): Promise<RunOutput> {
  // Not crypto.randomUUID(): that only exists on HTTPS/localhost.
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve) => {
    let settled = false;
    function finish(result: RunOutput) {
      if (settled) return;
      settled = true;
      socket.off("run:complete", onComplete);
      clearTimeout(timer);
      resolve(result);
    }

    function onComplete(data: { runId?: string; output: string; error?: boolean }) {
      if (data.runId === runId) finish({ output: data.output, error: !!data.error });
    }
    socket.on("run:complete", onComplete);

    const timer = setTimeout(
      () => finish({ output: "No response from the code runner", error: true }),
      RESULT_TIMEOUT_MS,
    );

    fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code, language, socketId: socket.id, runId }),
    })
      .then(async (res) => {
        if (res.ok) return;
        const body = await res.json().catch(() => null);
        finish({
          output: body?.error ?? body?.errors?.[0]?.message ?? `Run failed (${res.status})`,
          error: true,
        });
      })
      .catch(() => finish({ output: "Failed to reach server", error: true }));
  });
}
