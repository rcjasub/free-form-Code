import { useState } from "react";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";
import { TextRoll } from "@/components/TextRoll";
import Particles from "@/components/Particles";
import { getMe } from "@/API/auth";
import { getMyCanvases } from "@/API/canvas";
import { LOCAL_CANVAS_ID, getAllBlocks, hasBlocks } from "@/lib/localCanvas";
import { moveLocalCanvasOnline, uploadAfterSignUp } from "@/lib/moveOnline";

type AuthMode = "login" | "register";

// No border or focus ring: a filled field reads as an input on its own (like
// the dashboard's search bar); it lightens a little while you type in it.
const FIELD =
  "w-full px-3 py-2 text-sm rounded-lg border-0 outline-none bg-[#232329] focus:bg-[#2c2c36] transition-colors text-white placeholder:text-gray-400";

export default function Home() {
  const location = useLocation();
  // The canvas page's "Sign up" link sends guests here with mode: "register";
  // a shared canvas's "Sign in" passes redirect so they land back on it.
  const navState = location.state as { mode?: AuthMode; redirect?: string } | null;
  const [mode, setMode] = useState<AuthMode>(navState?.mode ?? "login");
  // Only same-site paths — "//evil.com" would leave the app.
  const redirect =
    navState?.redirect?.startsWith("/") && !navState.redirect.startsWith("//")
      ? navState.redirect
      : "/dashboard";
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  // Logged in with a guest canvas still in this browser: offer to add it.
  const [offerBrowserCanvas, setOfferBrowserCanvas] = useState(false);
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();

  function showError(err: unknown) {
    const response = axios.isAxiosError(err) ? err.response : undefined;
    const data = response?.data as
      | { error?: string; errors?: { message: string }[] }
      | undefined;
    if (data?.error) {
      setError(data.error);
    } else if (data?.errors?.length) {
      setError(data.errors.map((e) => e.message).join(", "));
    } else if (!response) {
      setError("Could not reach the server. Please check your connection and try again.");
    } else {
      setError("Something went wrong");
    }
  }

  async function handleTryAsGuest() {
    setError("");
    try {
      // A guest from before canvases lived in the browser: reopen their
      // server canvas.
      const me = await getMe();
      if (me?.isGuest) {
        const { data } = await getMyCanvases();
        if (data[0]) {
          navigate(`/canvas/${data[0].id}`);
          return;
        }
      }
      // Still logged in to an account: log out first, so the guest canvas
      // isn't tied to it (sharing it would otherwise land in that account).
      if (me && !me.isGuest) {
        await axios.post("/api/auth/logout", {}, { withCredentials: true });
      }
      // Everyone else gets a canvas kept in this browser — nothing is made
      // on the server until they sign up or share it (lib/localCanvas).
      navigate(`/canvas/${LOCAL_CANVAS_ID}`);
    } catch (err) {
      showError(err);
    }
  }

  // After sign-up, what they made as a guest (their browser canvas, and
  // images kept in the browser) goes into the account. If that fails it stays
  // in the browser, and the canvas page offers "Move to my account" to retry.
  async function uploadBrowserCanvas() {
    try {
      const { data } = await getMyCanvases();
      const id = await uploadAfterSignUp(data[0].id);
      navigate(navState?.redirect ? redirect : id ? `/canvas/${id}` : "/dashboard");
    } catch {
      navigate(`/canvas/${LOCAL_CANVAS_ID}`);
    }
  }

  async function addBrowserCanvas() {
    setAdding(true);
    setError("");
    try {
      const id = await moveLocalCanvasOnline();
      navigate(navState?.redirect ? redirect : `/canvas/${id}`);
    } catch (err) {
      showError(err);
      setAdding(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    try {
      if (mode === "register") {
        await axios.post("/api/auth/register", { username, email, password }, { withCredentials: true });
        if (await hasBlocks()) {
          await uploadBrowserCanvas();
          return;
        }
        navigate(redirect);
      } else {
        await axios.post("/api/auth/login", { email, password }, { withCredentials: true });
        // Unlike sign-up, logging in doesn't take it on its own: this may be
        // someone else's guest canvas on a shared computer.
        const local = await getAllBlocks().catch(() => ({ data: [] }));
        if (local.data.length > 0) {
          setOfferBrowserCanvas(true);
          return;
        }
        navigate(redirect);
      }
    } catch (err) {
      showError(err);
    }
  }

  return (
    <div className="dot-cursor min-h-screen flex items-center justify-center bg-[#121212] relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <Particles
          particleColors={["#ffffff"]}
          particleCount={200}
          particleSpread={10}
          speed={0.1}
          particleBaseSize={100}
          moveParticlesOnHover
          alphaParticles={false}
          disableRotation={false}
          pixelRatio={1}
        />
      </div>
      <div className="w-full max-w-sm px-6 relative z-10">

        {/* branding */}
        <div className="mb-8 text-center">
          <h1 className="text-[56px] font-semibold tracking-tight text-white">
            <TextRoll center>Free-Form</TextRoll>
          </h1>
          <p className="text-sm text-gray-400 mt-1">a canvas for your code</p>
        </div>

        {/* tabs */}
        <div className="flex border-b border-[#3c3c4a] mb-6">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 pb-2 text-sm font-medium transition-colors ${
              mode === "login"
                ? "border-b-2 border-white text-white"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            Login
          </button>
          <button
            onClick={() => setMode("register")}
            className={`flex-1 pb-2 text-sm font-medium transition-colors ${
              mode === "register"
                ? "border-b-2 border-white text-white"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            Register
          </button>
        </div>

        {offerBrowserCanvas ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-300">
              You have a canvas saved in this browser. Add it to your account?
            </p>
            {error && <p className="text-xs text-[#FF3B6B]">{error}</p>}
            <button
              type="button"
              onClick={addBrowserCanvas}
              disabled={adding}
              className="w-full py-2 text-sm font-medium rounded-lg bg-white text-gray-900 hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {adding ? "Adding…" : "Add to my account"}
            </button>
            <button
              type="button"
              onClick={() => navigate(redirect)}
              disabled={adding}
              className="w-full text-sm text-gray-400 hover:text-white transition-colors"
            >
              Not now
            </button>
          </div>
        ) : (
        <>
        {/* form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "register" && (
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={FIELD}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={FIELD}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={FIELD}
          />

          {error && <p className="text-xs text-[#FF3B6B]">{error}</p>}

          <button
            type="submit"
            className="w-full py-2 text-sm font-medium rounded-lg bg-white text-gray-900 hover:opacity-90 transition-opacity mt-1"
          >
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          onClick={handleTryAsGuest}
          className="w-full mt-4 text-sm text-gray-400 hover:text-white transition-colors"
        >
          Try without an account →
        </button>
        </>
        )}
      </div>
    </div>
  );
}
