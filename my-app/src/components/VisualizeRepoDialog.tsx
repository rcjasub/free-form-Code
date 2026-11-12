import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { isAxiosError } from "axios";
import { Network } from "lucide-react";
import { generateArchitecture, type AiModel, type Architecture, type DetailLevel } from "@/API/architecture";

interface Props {
  open: boolean;
  canvasId: string;
  onClose: () => void;
  // puts the generated diagram on the canvas; the dialog stays open (and
  // says so) until it's there
  onDiagram: (architecture: Architecture) => Promise<void>;
}

// Kept in this browser between visits, so the key is typed once. The key
// is sent with each request and used for that request only; the server
// never stores it. A GitHub token isn't kept at all.
const KEY_STORAGE = "free-form:anthropic-key";
const URL_STORAGE = "free-form:last-repo-url";
const MODEL_STORAGE = "free-form:ai-model";
const DETAIL_STORAGE = "free-form:ai-detail";

function load(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function save(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // private window or storage blocked: it just isn't remembered
  }
}

const MODELS: { id: AiModel; name: string; note: string }[] = [
  { id: "claude-sonnet-5-5", name: "Sonnet", note: "Faster, about half the cost" },
  { id: "claude-opus-5-5", name: "Opus", note: "More careful, for demos" },
];

const DETAILS: { id: DetailLevel; name: string; note: string }[] = [
  { id: "overview", name: "Overview", note: "The main parts, 5–9 boxes" },
  { id: "detailed", name: "Detailed", note: "Their pieces too, a bit more cost and time" },
];

// Asks for a GitHub repo and draws its architecture on the canvas: the AI
// reads the repo (Phase 2, steps 1-5) and the diagram is placed (step 7).
export default function VisualizeRepoDialog({ open, ...props }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          // while it fades out, clicks go through to the new diagram
          exit={{ opacity: 0, pointerEvents: "none" }}
          onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}
          // keep canvas shortcuts (Delete, Ctrl+Z, tools) out of the form
          onKeyDown={(e) => e.stopPropagation()}
        >
          {/* mounted only while open, so each opening starts fresh */}
          <VisualizeRepoForm {...props} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type Phase = "idle" | "generating" | "placing";

function VisualizeRepoForm({ canvasId, onClose, onDiagram }: Omit<Props, "open">) {
  const [repoUrl, setRepoUrl] = useState(() => load(URL_STORAGE));
  const [apiKey, setApiKey] = useState(() => load(KEY_STORAGE));
  const [model, setModel] = useState<AiModel>(() => (load(MODEL_STORAGE) === "claude-opus-5-5" ? "claude-opus-5-5" : "claude-sonnet-5-5"));
  const [detail, setDetail] = useState<DetailLevel>(() => (load(DETAIL_STORAGE) === "detailed" ? "detailed" : "overview"));
  const [githubToken, setGithubToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const busy = phase !== "idle";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // However the dialog closes (Cancel, Escape, a click outside), this form
  // unmounts, which stops a generation still running: the request is
  // dropped, so the server stops the AI call and it isn't paid for.
  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (phase !== "generating") return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !repoUrl.trim() || !apiKey.trim()) return;
    setError("");
    setSeconds(0);
    setPhase("generating");
    save(KEY_STORAGE, apiKey.trim());
    save(URL_STORAGE, repoUrl.trim());
    save(MODEL_STORAGE, model);
    save(DETAIL_STORAGE, detail);
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await generateArchitecture(
        canvasId,
        { repoUrl: repoUrl.trim(), model, detail },
        { apiKey: apiKey.trim(), githubToken: githubToken.trim() || undefined },
        controller.signal,
      );
      setPhase("placing");
      await onDiagram(result.architecture);
      onClose();
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(errorMessage(err));
      setPhase("idle");
    }
  }

  function forgetKey() {
    save(KEY_STORAGE, "");
    setApiKey("");
  }

  const input =
    "mt-1.5 w-full rounded-lg border-0 bg-gray-100 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-[#4f8cff]/50 disabled:opacity-60 dark:bg-[#232329] dark:text-white";
  const label = "mt-4 block text-sm font-medium text-gray-700 dark:text-gray-300";

  return (
    <motion.form
      role="dialog"
      aria-modal="true"
      aria-labelledby="visualize-repo-title"
      onSubmit={submit}
      className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-[#2e2e3a] dark:bg-[#1a1a22]"
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.18 }}
    >
      <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-[#4f8cff]/10 text-[#4f8cff]">
        <Network size={22} />
      </div>
      <h3 id="visualize-repo-title" className="text-lg font-semibold text-gray-900 dark:text-white">
        Visualize a repo
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        Claude reads a GitHub repo and draws its architecture here, as boxes and arrows you can edit.
      </p>

      <label className={label} htmlFor="visualize-repo-url">
        GitHub repo
      </label>
      <input
        id="visualize-repo-url"
        autoFocus
        value={repoUrl}
        disabled={busy}
        onChange={(e) => setRepoUrl(e.target.value)}
        className={input}
        placeholder="https://github.com/owner/repo"
        spellCheck={false}
      />

      <span className={label}>Model</span>
      <div className="mt-1.5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Model">
        {MODELS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={model === m.id}
            disabled={busy}
            onClick={() => setModel(m.id)}
            className={`rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-60 ${
              model === m.id
                ? "border-[#4f8cff] bg-[#4f8cff]/10"
                : "border-gray-200 hover:bg-gray-50 dark:border-[#2e2e3a] dark:hover:bg-[#232329]"
            }`}
          >
            <span className="block text-sm font-medium text-gray-900 dark:text-white">{m.name}</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">{m.note}</span>
          </button>
        ))}
      </div>

      <span className={label}>Detail</span>
      <div className="mt-1.5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Detail">
        {DETAILS.map((d) => (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={detail === d.id}
            disabled={busy}
            onClick={() => setDetail(d.id)}
            className={`rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-60 ${
              detail === d.id
                ? "border-[#4f8cff] bg-[#4f8cff]/10"
                : "border-gray-200 hover:bg-gray-50 dark:border-[#2e2e3a] dark:hover:bg-[#232329]"
            }`}
          >
            <span className="block text-sm font-medium text-gray-900 dark:text-white">{d.name}</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">{d.note}</span>
          </button>
        ))}
      </div>

      <label className={label} htmlFor="visualize-api-key">
        Anthropic API key
      </label>
      <input
        id="visualize-api-key"
        type="password"
        autoComplete="off"
        value={apiKey}
        disabled={busy}
        onChange={(e) => setApiKey(e.target.value)}
        className={input}
        placeholder="sk-ant-…"
        spellCheck={false}
      />
      <p className="mt-1.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        Kept in this browser only, and sent with each request; the server never stores it.
        {apiKey && !busy && (
          <>
            {" "}
            <button type="button" onClick={forgetKey} className="underline hover:text-gray-700 dark:hover:text-gray-200">
              Forget it
            </button>
          </>
        )}
      </p>

      {showToken ? (
        <>
          <label className={label} htmlFor="visualize-github-token">
            GitHub token <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <input
            id="visualize-github-token"
            type="password"
            autoComplete="off"
            value={githubToken}
            disabled={busy}
            onChange={(e) => setGithubToken(e.target.value)}
            className={input}
            placeholder="ghp_… or github_pat_…"
            spellCheck={false}
          />
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">For private repos. Used for this request only, not kept.</p>
        </>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => setShowToken(true)}
          className="mt-3 text-xs text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Private repo? Add a GitHub token
        </button>
      )}

      {busy && (
        <p role="status" className="mt-5 text-sm text-gray-600 dark:text-gray-400">
          {phase === "placing"
            ? "Drawing it on the canvas…"
            : `Reading the repo and working out its architecture… ${seconds}s (usually 10–30s)`}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-[#FF3B6B]">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-[#2e2e3a]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !repoUrl.trim() || !apiKey.trim()}
          className="rounded-lg bg-[#4f8cff] px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Generating…" : "Generate diagram"}
        </button>
      </div>
    </motion.form>
  );
}

// The server says what went wrong in words meant for the user (a wrong
// key, GitHub's limit, a repo that isn't there); anything else gets a
// general message.
function errorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as { error?: unknown } | undefined;
    if (typeof data?.error === "string" && data.error) return data.error;
    if (!err.response) return "Couldn't reach the server. Check your connection and try again.";
  }
  return "Something went wrong generating the diagram. Try again.";
}
