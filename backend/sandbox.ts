// Runs user code in Piston, an isolated sandbox service — never in this
// process. PISTON_URL is only set where a sandbox exists (local dev); without
// it, code running is simply off, so a deploy that forgets the setting fails
// safe instead of running untrusted code.
const PISTON_URL = process.env.PISTON_URL;

// Our language names → Piston's.
export const LANGUAGES = {
  javascript: "javascript",
  python: "python",
  cpp: "c++",
  java: "java",
} as const;

export type Language = keyof typeof LANGUAGES;

export interface RunResult {
  output: string;
  error: boolean;
}

interface PistonStage {
  output: string;
  code: number | null;
  signal: string | null;
  message: string | null;
}

interface PistonResponse {
  compile?: PistonStage;
  run: PistonStage;
}

export async function runInSandbox(language: Language, code: string): Promise<RunResult> {
  if (!PISTON_URL) {
    return { output: "Code running isn't available yet.", error: true };
  }

  try {
    const res = await fetch(`${PISTON_URL}/api/v2/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: LANGUAGES[language],
        version: "*",
        files: [{ content: code }],
        compile_timeout: 10000,
        run_timeout: 3000,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      return { output: body?.message ?? `Code runner error (${res.status})`, error: true };
    }

    const data = (await res.json()) as PistonResponse;

    // C++ / Java: a failed compile means there's nothing to run.
    if (data.compile && data.compile.code !== 0) {
      return { output: data.compile.output.trim() || "Compilation failed", error: true };
    }

    const { run } = data;
    const failed = run.code !== 0 || run.signal !== null;
    const output = run.output.trim() || (failed && run.message) || "(no output)";
    return { output, error: failed };
  } catch (err) {
    console.error("Sandbox request failed:", (err as Error).message);
    return { output: "Code runner is unreachable", error: true };
  }
}
