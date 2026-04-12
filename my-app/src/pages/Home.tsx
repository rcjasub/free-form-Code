import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { TextRoll } from "@/components/TextRoll";
import Particles from "@/components/Particles";

type AuthMode = "login" | "register";

export default function Home() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    try {
      if (mode === "register") {
        await axios.post("/api/auth/register", { username, email, password }, { withCredentials: true });
        await axios.post("/api/canvases", { name: "My Canvas" }, { withCredentials: true });
        navigate("/dashboard");
      } else {
        await axios.post("/api/auth/login", { email, password }, { withCredentials: true });
        navigate("/dashboard");
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Something went wrong");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#121212] relative overflow-hidden">
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
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
            <TextRoll center>free-form</TextRoll>
          </h1>
          <p className="text-sm text-gray-400 mt-1">a canvas for your code</p>
        </div>

        {/* tabs */}
        <div className="flex border-b border-gray-200 dark:border-[#3c3c4a] mb-6">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 pb-2 text-sm font-medium transition-colors ${
              mode === "login"
                ? "border-b-2 border-gray-900 dark:border-white text-gray-900 dark:text-white"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            Login
          </button>
          <button
            onClick={() => setMode("register")}
            className={`flex-1 pb-2 text-sm font-medium transition-colors ${
              mode === "register"
                ? "border-b-2 border-gray-900 dark:border-white text-gray-900 dark:text-white"
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
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#3c3c4a] bg-white dark:bg-[#232329] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-[#5c5c6a]"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#3c3c4a] bg-white dark:bg-[#232329] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-[#5c5c6a]"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#3c3c4a] bg-white dark:bg-[#232329] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-[#5c5c6a]"
          />

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            type="submit"
            className="w-full py-2 text-sm font-medium rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 transition-opacity mt-1"
          >
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
