import { useState, useEffect } from "react";

const LogoutIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

function SignOutButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#2e2e3a] hover:text-gray-900 dark:hover:text-white transition-all"
    >
      <LogoutIcon size={16} />
      Sign out
    </button>
  );
}
import { Trash2, Search } from "lucide-react";
import axios from "axios";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { useNavigate } from "react-router-dom";
import { TextRoll } from "@/components/TextRoll";
import { ThemeToggleButton } from "@/components/ThemeToggle";

type FormState = "idle" | "loading" | "success";

interface Canvas {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}


export default function Dashboard() {
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>("idle");
  const [canvasName, setCanvasName] = useState("");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    axios
      .get("/api/canvases", { withCredentials: true })
      .then(({ data }) => setCanvases(data))
      .catch(() => navigate("/"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "Enter" &&
        open &&
        formState === "idle"
      ) {
        submitCanvas();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, formState, canvasName]);

  async function submitCanvas() {
    if (!canvasName.trim()) return;
    setFormState("loading");
    try {
      const { data } = await axios.post(
        "/api/canvases",
        { name: canvasName.trim() },
        { withCredentials: true },
      );
      setFormState("success");
      setTimeout(() => {
        setOpen(false);
        setFormState("idle");
        setCanvasName("");
        navigate(`/canvas/${data.id}`);
      }, 1500);
    } catch {
      setError("Failed to create canvas");
      setFormState("idle");
    }
  }

  async function deleteCanvas(id: string) {
    try {
      await axios.delete(`/api/canvases/${id}`, { withCredentials: true });
      setCanvases((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setError("Failed to delete canvas");
    }
  }

  async function signOut() {
    await axios.post("/api/auth/logout", {}, { withCredentials: true });
    navigate("/");
  }

  const filtered = canvases.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-white dark:bg-[#121212]">
      {/* header */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-gray-100 dark:border-[#2e2e3a]">
        <div className="flex items-center gap-2">
          <DotLottieReact
            src="https://lottie.host/ba280eed-ba90-41e4-bca2-21a7e13bb168/FjzsnbcULu.lottie"
            loop
            autoplay
            style={{ width: 120, height: 120 }}
          />
          <h1 className="text-[56px] font-semibold text-gray-900 dark:text-white">
            <TextRoll>free-form</TextRoll>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggleButton />
          <SignOutButton onClick={signOut} />
        </div>
      </div>

      {/* content */}
      <div className="max-w-4xl mx-auto px-8 py-12">
        {/* row: title + count | search | new button */}
        <div className="flex items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">
                Your canvases
              </h2>
              {!loading && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-[#2e2e3a] text-gray-500 dark:text-gray-400">
                  {canvases.length}
                </span>
              )}
            </div>

            {/* search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-[#3c3c4a] bg-white dark:bg-[#1a1a22] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-[#5c5c6a] w-40"
              />
            </div>
          </div>

          <button
            onClick={() => setOpen(true)}
            className="flex h-9 items-center gap-1.5 px-3 rounded-lg border border-gray-200 dark:border-[#3c3c4a] bg-white dark:bg-[#1a1a22] text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-[#5c5c6a] transition-colors"
          >
            <span className="text-base leading-none">+</span> New canvas
          </button>

          {/* modal */}
          {open && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center"
              onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
            >
              {/* backdrop */}
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

              {/* dialog */}
              <div className="relative w-full max-w-sm mx-4 rounded-xl border border-gray-200 dark:border-[#3c3c4a] bg-white dark:bg-[#1a1a22] shadow-xl">
                {formState === "success" ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M27.6 16C27.6 22.4 22.4 27.6 16 27.6C9.6 27.6 4.4 22.4 4.4 16C4.4 9.6 9.6 4.4 16 4.4C22.4 4.4 27.6 9.6 27.6 16Z" fill="#2090FF" fillOpacity="0.16"/>
                      <path d="M12.1 17l2.9 2.9 4.9-6.8" stroke="#2090FF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Canvas created</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Opening your new canvas...</p>
                  </div>
                ) : (
                  <form onSubmit={(e) => { e.preventDefault(); submitCanvas(); }}>
                    <div className="px-5 pt-5 pb-4">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">New canvas</h3>
                      <input
                        autoFocus
                        placeholder="Canvas name"
                        value={canvasName}
                        onChange={(e) => setCanvasName(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#3c3c4a] bg-white dark:bg-[#232329] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-[#5c5c6a]"
                        required
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2 px-5 pb-4">
                      <button
                        type="button"
                        onClick={() => { setOpen(false); setCanvasName(""); }}
                        className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={formState === "loading"}
                        className="px-4 py-1.5 text-sm font-medium rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {formState === "loading" ? "Creating..." : "Create"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-red-500 mb-4">{error}</p>}

        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            {canvases.length === 0 && (
              <DotLottieReact
                src="https://lottie.host/8d13b0aa-5de0-4f9a-a7e8-cb3cd8753ce3/xe91mezaIy.lottie"
                loop
                autoplay
                style={{ width: 200, height: 200 }}
              />
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {canvases.length === 0
                ? "No canvases yet. Create one to get started."
                : `No canvases match "${search}".`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {filtered.map((c, i) => (
              <div
                key={c.id}
                className="card-in relative group rounded-xl border border-gray-300 dark:border-[#2e2e3a] hover:border-gray-400 dark:hover:border-[#4e4e5a] hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-black/40 transition-all duration-200 cursor-pointer overflow-hidden"
                style={{ animationDelay: `${i * 60}ms` }}
                onClick={() => navigate(`/canvas/${c.id}`)}
              >

                {/* dot grid preview */}
                <div
                  className="relative h-32"
                  style={{
                    backgroundColor: "var(--canvas-bg, #ffffff)",
                    backgroundImage: "radial-gradient(circle, var(--canvas-dot, #d1d5db) 1px, transparent 1px)",
                    backgroundSize: "20px 20px",
                  }}
                >
                  {/* gradient fade into footer */}
                  <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white dark:from-[#1a1a22] to-transparent" />
                </div>

                {/* card footer */}
                <div className="flex items-center justify-between px-3 py-2.5 bg-white dark:bg-[#1a1a22]">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      edited {timeAgo(c.updated_at)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteCanvas(c.id); }}
                    className="ml-2 shrink-0 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
