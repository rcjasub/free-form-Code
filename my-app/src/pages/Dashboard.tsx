import { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import axios from "axios";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { useNavigate } from "react-router-dom";
import { TextRoll } from "@/components/TextRoll";
import {
  PopoverForm,
  PopoverFormButton,
  PopoverFormCutOutLeftIcon,
  PopoverFormCutOutRightIcon,
  PopoverFormSeparator,
  PopoverFormSuccess,
} from "@/components/ui/popover-form";

type FormState = "idle" | "loading" | "success";

interface Canvas {
  id: string;
  name: string;
  created_at: string;
}

export default function Dashboard() {
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>("idle");
  const [canvasName, setCanvasName] = useState("");
  const navigate = useNavigate();

  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!token) {
      navigate("/");
      return;
    }
    axios
      .get("/api/canvases", { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => setCanvases(data))
      .catch(() => setError("Failed to load canvases"))
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
        { headers: { Authorization: `Bearer ${token}` } },
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
      await axios.delete(`/api/canvases/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCanvases((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setError("Failed to delete canvas");
    }
  }

  function signOut() {
    localStorage.removeItem("token");
    navigate("/");
  }

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
          <h1 className="text-base font-semibold text-gray-900 dark:text-white">
            <TextRoll>free-form</TextRoll>
          </h1>
        </div>
        <button
          onClick={signOut}
          className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* banner animation */}
      {/* <div className="w-full flex justify-end px-8">
        <DotLottieReact
          src="https://lottie.host/36bf90e6-b370-4703-ab50-4a844f442b98/HVRvvvCfOy.lottie"
          loop
          autoplay
          style={{ width: 120, height: 120 }}
        />
      </div> */}

      {/* content */}
      <div className="max-w-4xl mx-auto px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            Your canvases
          </h2>
          <PopoverForm
            title="New canvas"
            open={open}
            setOpen={setOpen}
            width="300px"
            height="144px"
            showCloseButton={formState !== "success"}
            showSuccess={formState === "success"}
            openChild={
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitCanvas();
                }}
              >
                <div className="relative">
                  <input
                    autoFocus
                    placeholder="Canvas name"
                    value={canvasName}
                    onChange={(e) => setCanvasName(e.target.value)}
                    className="w-full rounded-t-lg p-3 text-sm outline-none bg-white dark:bg-[#1a1a22] text-gray-900 dark:text-white placeholder:text-gray-400"
                    required
                  />
                </div>
                <div className="relative flex h-12 items-center px-[10px]">
                  <PopoverFormSeparator />
                  <div className="absolute left-0 top-0 -translate-x-[1.5px] -translate-y-1/2">
                    <PopoverFormCutOutLeftIcon />
                  </div>
                  <div className="absolute right-0 top-0 translate-x-[1.5px] -translate-y-1/2 rotate-180">
                    <PopoverFormCutOutRightIcon />
                  </div>
                  <PopoverFormButton loading={formState === "loading"} />
                </div>
              </form>
            }
            successChild={
              <PopoverFormSuccess
                title="Canvas created"
                description="Opening your new canvas..."
              />
            }
          />
        </div>

        {error && <p className="text-xs text-red-500 mb-4">{error}</p>}

        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : canvases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <DotLottieReact
              src="https://lottie.host/8d13b0aa-5de0-4f9a-a7e8-cb3cd8753ce3/xe91mezaIy.lottie"
              loop
              autoplay
              style={{ width: 200, height: 200 }}
            />
            <p className="text-sm text-gray-400">
              No canvases yet. Create one to get started.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {canvases.map((c) => (
              <div
                key={c.id}
                className="relative group p-4 rounded-xl border border-gray-100 dark:border-[#2e2e3a] bg-gray-50 dark:bg-[#1a1a22] hover:border-gray-300 dark:hover:border-[#4e4e5a] transition-colors cursor-pointer"
                onClick={() => navigate(`/canvas/${c.id}`)}
              >
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {c.name}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(c.created_at).toLocaleDateString()}
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteCanvas(c.id); }}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
