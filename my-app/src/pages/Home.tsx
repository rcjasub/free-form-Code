import { useState } from "react";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";
import { TextRoll } from "@/components/TextRoll";
import Particles from "@/components/Particles";
import { getMe, startGuest } from "@/API/auth";

type AuthMode = "login" | "register";

export default function Home() {
  const location = useLocation();
  // The canvas page's "Sign up" link sends guests here with mode: "register".
  const [mode, setMode] = useState<AuthMode>(
    (location.state as { mode?: AuthMode } | null)?.mode ?? "login",
  );
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
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
      // Returning guest: reopen their canvas instead of minting a new guest
      // and orphaning the old one.
      const me = await getMe();
      if (me?.isGuest) {
        const { data } = await axios.get("/api/canvases", { withCredentials: true });
        if (data[0]) {
          navigate(`/canvas/${data[0].id}`);
          return;
        }
      }
      const { data } = await startGuest();
      navigate(`/canvas/${data.canvasId}`);
    } catch (err) {
      showError(err);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    try {
      if (mode === "register") {
        await axios.post("/api/auth/register", { username, email, password }, { withCredentials: true });
        navigate("/dashboard");
      } else {
        await axios.post("/api/auth/login", { email, password }, { withCredentials: true });
        navigate("/dashboard");
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
            <TextRoll center>free-form</TextRoll>
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

        {/* form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "register" && (
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[#3c3c4a] bg-[#232329] text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#5c5c6a]"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[#3c3c4a] bg-[#232329] text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#5c5c6a]"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[#3c3c4a] bg-[#232329] text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#5c5c6a]"
          />

          {error && <p className="text-xs text-red-500">{error}</p>}

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
      </div>
    </div>
  );
}
