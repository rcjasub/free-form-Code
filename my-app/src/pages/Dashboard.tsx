import { useState, useEffect, useId, useRef, useCallback } from "react";
import { UserMinusIcon, type UserMinusIconHandle } from "@/components/ui/user-minus-icon";
import DeleteAccountDialog from "@/components/DeleteAccountDialog";
import { AnimatePresence, animate, motion, useMotionTemplate, useMotionValue } from "motion/react";

const LogoutIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

// The header's actions in one floating pill: the theme toggle, a divider,
// sign out (which turns the canvas menu's "Delete all" red and nudges its
// arrow out on hover), and delete account, a round icon button that turns
// red and plays its icon on hover. Guests have no account to delete.
function HeaderActions({ onSignOut, onDeleteAccount }: { onSignOut: () => void; onDeleteAccount?: () => void }) {
  const deleteIcon = useRef<UserMinusIconHandle>(null);
  return (
    <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white/80 p-1 shadow-sm backdrop-blur-md dark:border-[#2e2e3a] dark:bg-[#1a1a22]/80">
      <ThemeToggleButton className="size-8 rounded-full bg-transparent p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:bg-transparent dark:text-gray-300 dark:hover:bg-[#2e2e3a] dark:hover:text-white" />
      <span aria-hidden className="h-5 w-px bg-gray-200 dark:bg-[#2e2e3a]" />
      <button
        type="button"
        onClick={onSignOut}
        className="group flex h-8 items-center gap-2 rounded-full pl-3 pr-3.5 text-sm font-medium text-gray-700 transition-colors hover:bg-[#FF3B6B]/10 hover:text-[#FF3B6B] dark:text-gray-200 dark:hover:bg-[#FF3B6B]/10 dark:hover:text-[#FF3B6B]"
      >
        <span className="transition-transform duration-200 group-hover:translate-x-0.5">
          <LogoutIcon size={15} />
        </span>
        Sign out
      </button>
      {onDeleteAccount && (
        <button
          type="button"
          onClick={onDeleteAccount}
          onMouseEnter={() => deleteIcon.current?.startAnimation()}
          onMouseLeave={() => deleteIcon.current?.stopAnimation()}
          title="Delete account"
          aria-label="Delete account"
          className="flex size-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-[#FF3B6B]/10 hover:text-[#FF3B6B] dark:text-gray-400 dark:hover:bg-[#FF3B6B]/10 dark:hover:text-[#FF3B6B]"
        >
          <UserMinusIcon ref={deleteIcon} size={16} />
        </button>
      )}
    </div>
  );
}
import { Trash2 } from "lucide-react";
import axios from "axios";
import { getMe } from "@/API/auth";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { useNavigate } from "react-router-dom";
import { TextRoll } from "@/components/TextRoll";
import { ThemeToggleButton } from "@/components/ThemeToggle";
import { useTheme } from "next-themes";
// Header cat: the original LottieFiles black cat in dark mode, and a recolored
// copy in light mode — white with a dark belly (fur and belly colors swapped,
// nose and shadow unchanged). ?url so Vite serves it for DotLottie to fetch.
import whiteCatUrl from "@/assets/cat-inverted.json?url";
const BLACK_CAT_URL = "https://lottie.host/ba280eed-ba90-41e4-bca2-21a7e13bb168/FjzsnbcULu.lottie";
import { ShootingStars } from "@/components/ui/shooting-stars";
import { StarsBackground } from "@/components/ui/stars-background";
import { Liquid } from "@/components/ui/button-1";
import ExpandableSearchBar from "@/components/ui/expandable-search-bar";
import { SquigglyText } from "@/components/ui/squiggly-text";
import { CardBody, CardContainer, CardItem } from "@/components/ui/3d-card";
import CanvasPreview, { type PreviewItem } from "@/components/CanvasPreview";
import { canvasBackgroundStyle, loadCanvasBackground } from "@/lib/canvasBackground";

// The canvas pattern drawn at this zoom on a card, so its dots or grid look
// about as dense next to a sketch as they do on the canvas.
const CARD_PATTERN_SCALE = 0.72;

// blue liquid palette from the ui-layouts button-1 demo
const LIQUID_COLORS = {
  color1: "#FFFFFF",
  color2: "#1E10C5",
  color3: "#9089E2",
  color4: "#FCFCFE",
  color5: "#F9F9FD",
  color6: "#B2B8E7",
  color7: "#0E2DCB",
  color8: "#0017E9",
  color9: "#4743EF",
  color10: "#7D7BF4",
  color11: "#0B06FC",
  color12: "#C5C1EA",
  color13: "#1403DE",
  color14: "#B6BAF6",
  color15: "#C1BEEB",
  color16: "#290ECB",
  color17: "#3F4CC0",
};

// The letters' hover fill, timed like the Origin Button component's.
const LETTER_FILL = { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const };

// Diameter of a circle centered at (x, y) that covers the whole w x h box.
function coverDiameter(w: number, h: number, x: number, y: number) {
  return 2 * Math.max(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y));
}

// Dark-mode New canvas button: the ui-layouts liquid button, resized to sit
// in the toolbar row. A blurred liquid glow behind, the liquid fill clipped
// to the button, and a transparent <button> on top for clicks + hover.
// On hover the letters fill with yellow in a circle that grows from where
// the pointer came in (the Origin Button effect), instead of snapping.
function LiquidNewCanvasButton({ onClick }: { onClick: () => void }) {
  const [isHovered, setIsHovered] = useState(false);
  const id = useId();
  // Only the circle's size animates; its center jumps straight to where the
  // pointer came in, so a new hover never slides over from the last one.
  const radius = useMotionValue(0);
  const originX = useMotionValue(0);
  const originY = useMotionValue(0);
  const clipPath = useMotionTemplate`circle(${radius}px at ${originX}px ${originY}px)`;

  function startFill(e: React.PointerEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    originX.set(x);
    originY.set(y);
    animate(radius, coverDiameter(rect.width, rect.height, x, y) / 2, LETTER_FILL);
    setIsHovered(true);
  }

  function endFill() {
    animate(radius, 0, LETTER_FILL);
    setIsHovered(false);
  }

  const label = (
    <>
      <span className="text-base leading-none">+</span> New canvas
    </>
  );
  return (
    <div className="relative inline-block w-36 h-10 shrink-0 bg-black rounded-lg">
      {/* glow */}
      <div className="absolute w-[112.81%] h-[128.57%] top-[8.57%] left-1/2 -translate-x-1/2 filter blur-[19px] opacity-70 pointer-events-none">
        <span className="absolute inset-0 rounded-lg bg-[#d9d9d9] filter blur-[6.5px]" />
        <div className="relative w-full h-full overflow-hidden rounded-lg">
          <Liquid isHovered={isHovered} colors={LIQUID_COLORS} id={`${id}-glow`} />
        </div>
      </div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[40%] w-[92.23%] h-[112.85%] rounded-lg bg-[#010128] filter blur-[7.3px] pointer-events-none" />
      {/* fill */}
      <div className="relative w-full h-full overflow-hidden rounded-lg pointer-events-none">
        <span className="absolute inset-0 rounded-lg bg-[#d9d9d9]" />
        <span className="absolute inset-0 rounded-lg bg-black" />
        <Liquid isHovered={isHovered} colors={LIQUID_COLORS} id={`${id}-fill`} />
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`absolute inset-0 rounded-lg border-solid border-[3px] mix-blend-overlay filter ${
              i <= 2 ? "blur-[3px]" : i === 3 ? "blur-[5px]" : "blur-[4px]"
            }`}
          />
        ))}
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[40%] w-[70.8%] h-[42.85%] rounded-lg filter blur-[15px] bg-[#006]" />
      </div>
      <button
        type="button"
        onClick={onClick}
        onPointerEnter={startFill}
        onPointerLeave={endFill}
        className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-lg bg-transparent text-sm font-semibold text-white whitespace-nowrap"
      >
        {label}
        {/* a yellow copy of the label, revealed through a growing circle */}
        <motion.span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center gap-1.5 text-yellow-300 pointer-events-none"
          style={{ clipPath }}
        >
          {label}
        </motion.span>
      </button>
    </div>
  );
}

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
  // each canvas's sketch, by id (loaded after the list; cards show the dot
  // grid alone until then, or if it fails)
  const [previews, setPreviews] = useState<Record<string, PreviewItem[]>>({});
  // the background picked on the canvas (dots, grid or blank). It's one
  // setting for the whole browser, so every card shows the same one.
  const [background, setBackground] = useState(loadCanvasBackground);
  // the "Delete account" confirmation is open
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const closeDeleteDialog = useCallback(() => setConfirmingDelete(false), []);
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me) {
          navigate("/");
          return;
        }
        const { data } = await axios.get("/api/canvases", { withCredentials: true });
        // Guests only get one canvas and no dashboard — send them straight to it.
        if (me.isGuest) {
          navigate(data[0] ? `/canvas/${data[0].id}` : "/", { replace: true });
          return;
        }
        setCanvases(data);
        loadPreviews();
      } catch {
        navigate("/");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // The sketches are a snapshot taken when the dashboard loads; coming back
  // to this tab (after editing in another one, say) takes a fresh one.
  function loadPreviews() {
    axios
      .get("/api/canvases/previews", { withCredentials: true })
      .then(({ data }) => setPreviews(data))
      .catch(() => {});
  }
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      loadPreviews();
      setBackground(loadCanvasBackground());
    };
    // picked in another tab while this one is open
    const onStorage = () => setBackground(loadCanvasBackground());
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("storage", onStorage);
    };
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
    <div className="dot-cursor relative min-h-screen bg-white dark:bg-[#121212]">
      {/* sky behind the page: white stars at night, ink specks with blue
          pen-stroke shooting stars by day. Fixed so it covers the screen
          while the list scrolls, click-through so it never blocks the cards */}
      <div className="fixed inset-0 pointer-events-none">
        {isDark ? (
          <>
            <StarsBackground />
            <ShootingStars />
          </>
        ) : (
          <>
            <StarsBackground starColor="100, 116, 139" starRadius={0.9} starDensity={0.0002} />
            <ShootingStars starColor="#1a8ad4" trailColor="#6fbdf0" starHeight={2} />
          </>
        )}
      </div>

      {/* header */}
      <div className="relative z-10 flex items-center justify-between px-8 py-4 border-b border-gray-100 dark:border-[#2e2e3a]">
        <div className="flex items-center gap-2">
          <DotLottieReact
            // key: remount on theme change so the new animation actually loads
            key={isDark ? "black-cat" : "white-cat"}
            src={isDark ? BLACK_CAT_URL : whiteCatUrl}
            loop
            autoplay
            style={{ width: 120, height: 120 }}
          />
          <h1 className="text-[56px] font-semibold text-gray-900 dark:text-white">
            <TextRoll>Free-Form</TextRoll>
          </h1>
        </div>
        <HeaderActions onSignOut={signOut} onDeleteAccount={() => setConfirmingDelete(true)} />
      </div>
      <DeleteAccountDialog
        open={confirmingDelete}
        canvasCount={loading ? null : canvases.length}
        onClose={closeDeleteDialog}
        // signed out by the server; back to the start, with no way back here
        onDeleted={() => navigate("/", { replace: true })}
      />

      {/* content */}
      <div className="relative z-10 max-w-4xl mx-auto px-8 py-12">
        {/* row: title + count | search | new button */}
        <div className="flex items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              {/* "canvases" and the count wobble like a hand-drawn cartoon */}
              <h2 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
                Your{" "}
                <SquigglyText scale={[2, 4]} stepDuration={90} className="text-[#1a8ad4] dark:text-[#6fbdf0]">
                  canvases
                </SquigglyText>
              </h2>
              {!loading && (
                <SquigglyText
                  scale={[2, 3]}
                  stepDuration={120}
                  className="min-w-7 text-center text-sm font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
                >
                  {canvases.length}
                </SquigglyText>
              )}
            </div>

            {/* search: opens to the right, filters as you type */}
            <ExpandableSearchBar expandDirection="right" width={260} placeholder="Search canvases..." onChange={setSearch} />
          </div>

          {isDark ? (
            <LiquidNewCanvasButton onClick={() => setOpen(true)} />
          ) : (
            <button
              onClick={() => setOpen(true)}
              // neobrutalist: hard offset shadow that the button "presses
              // into" on hover
              className="flex h-10 items-center gap-1.5 px-4 rounded-[5px] border-2 text-sm font-medium transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none bg-white text-black border-black shadow-[4px_4px_0px_0px_#000]"
            >
              <span className="text-base leading-none">+</span> New canvas
            </button>
          )}

          {/* modal */}
          {open && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center"
              onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
            >
              {/* backdrop */}
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

              {/* dialog */}
              <div className="relative w-full max-w-sm mx-4 rounded-xl bg-white dark:bg-[#1a1a22] shadow-xl">
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
                        // no border or focus ring — a filled field reads as the
                        // input on its own (toolbar gray in dark mode)
                        className="w-full px-3 py-2 text-sm rounded-lg border-0 outline-none bg-gray-100 dark:bg-[#232329] text-gray-900 dark:text-white placeholder:text-gray-400"
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

        {error && <p className="text-xs text-[#FF3B6B] mb-4">{error}</p>}

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
            <AnimatePresence mode="popLayout" initial={true}>
            {filtered.map((c, i) => (
              <motion.div
                key={c.id}
                layout
                // cards blur in one after another and out as the search
                // narrows, the way spotlight results do
                initial={{ opacity: 0, y: 10, filter: "blur(5px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.96, filter: "blur(5px)" }}
                transition={{
                  default: { duration: 0.25, ease: "easeOut", delay: Math.min(i, 8) * 0.05 },
                  layout: { type: "spring", bounce: 0.2, duration: 0.5 },
                }}
                className="group cursor-pointer"
                onClick={() => navigate(`/canvas/${c.id}`)}
              >
                {/* Dark: the card tilts gently toward the pointer, and the sketch,
                    name and delete button lift a little off it (staying inside its
                    edges). Light: flat, with a solid shadow under an outline, like
                    the light New canvas button. Dark: a faint outline all the way
                    round, and only a light shadow on hover. */}
                <CardContainer disabled={!isDark} tiltDivisor={20} className="w-full" containerClassName="w-full">
                  {/* Light: the solid shadow, a dark card-shaped plate behind the
                      card, 4px down and right. The card lifting 2px on hover makes
                      it look 6px. (A CSS box-shadow leaves a hairline of page
                      between it and the outline at the corners.) */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 translate-x-1 translate-y-1 rounded-xl bg-gray-900 dark:hidden"
                  />
                  <CardBody
                    // p-px (light): the contents stop 1px in, under the middle of the
                    // 2px outline, so their soft edges can't show through it
                    className="relative w-full rounded-xl bg-white bg-clip-content p-px dark:p-0 transition-[translate,box-shadow] duration-200
                      hover:-translate-x-0.5 hover:-translate-y-0.5
                      dark:bg-[#1a1a22]
                      dark:hover:translate-x-0 dark:hover:translate-y-0 dark:hover:shadow-[0_18px_30px_-20px_rgba(0,0,0,0.7)]"
                  >
                    {/* the canvas's background (dots, grid or blank) behind its sketch */}
                    <div
                      className="relative h-32 rounded-t-[calc(var(--radius-xl)-1px)] dark:rounded-t-xl"
                      style={canvasBackgroundStyle(background, isDark, CARD_PATTERN_SCALE, { x: 0, y: 0 })}
                    >
                      {/* gradient fade into footer */}
                      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white dark:from-[#1a1a22] to-transparent" />
                      {previews[c.id] && (
                        <CardItem translateZ={48} className="absolute inset-x-4 top-4 bottom-5 w-auto">
                          <CanvasPreview items={previews[c.id]} isDark={isDark} />
                        </CardItem>
                      )}
                    </div>

                    {/* card footer */}
                    <div className="flex items-center justify-between px-3 py-2.5 rounded-b-[calc(var(--radius-xl)-1px)] dark:rounded-b-xl bg-white dark:bg-[#1a1a22]">
                      <CardItem translateZ={36} className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          edited {timeAgo(c.updated_at)}
                        </p>
                      </CardItem>
                      <CardItem
                        as="button"
                        translateZ={48}
                        aria-label={`Delete ${c.name}`}
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); deleteCanvas(c.id); }}
                        className="ml-2 shrink-0 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-[#FF3B6B] transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </CardItem>
                    </div>
                    {/* Light: the outline, drawn over the card rather than as its border,
                        so nothing inside can paint over its corners. */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-xl border-2 border-gray-900 dark:hidden"
                    />
                  </CardBody>
                </CardContainer>
              </motion.div>
            ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
