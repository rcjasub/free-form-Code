import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { isAxiosError } from "axios";
import { deleteAccount } from "@/API/auth";
import { UserMinusIcon, type UserMinusIconHandle } from "@/components/ui/user-minus-icon";

interface Props {
  open: boolean;
  // how many canvases the dashboard shows, to say what goes with the account
  // (null while they're still loading)
  canvasCount: number | null;
  onClose: () => void;
  onDeleted: () => void;
}

// Asks for the password before deleting the account, and says plainly what
// goes with it. Clicking outside, Escape or Cancel closes it.
export default function DeleteAccountDialog({ open, ...props }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}
        >
          {/* mounted only while open, so each opening starts with an empty form */}
          <DeleteAccountForm {...props} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DeleteAccountForm({ canvasCount, onClose, onDeleted }: Omit<Props, "open">) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const icon = useRef<UserMinusIconHandle>(null);

  useEffect(() => {
    icon.current?.startAnimation();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || deleting) return;
    setDeleting(true);
    setError("");
    try {
      await deleteAccount(password);
      onDeleted();
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      setError(
        status === 401
          ? "That password isn't right."
          : status === 429
            ? "Too many attempts. Try again in 2 minutes."
            : "Couldn't delete your account. Check your connection and try again.",
      );
      setDeleting(false);
    }
  }

  const what =
    canvasCount === null
      ? "your account and all of your canvases, with everything on them. Their share links stop working."
      : canvasCount === 0
        ? "your account."
      : canvasCount === 1
        ? "your account and your canvas, with everything on it. Its share links stop working."
        : `your account and all ${canvasCount} of your canvases, with everything on them. Their share links stop working.`;

  return (
    <motion.form
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
      onSubmit={submit}
      className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-[#2e2e3a] dark:bg-[#1a1a22]"
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.18 }}
    >
      <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-[#FF3B6B]/10 text-[#FF3B6B]">
        <UserMinusIcon ref={icon} size={22} />
      </div>
      <h3 id="delete-account-title" className="text-lg font-semibold text-gray-900 dark:text-white">
        Delete your account?
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        This permanently deletes {what}{" "}
        <span className="font-medium text-gray-900 dark:text-gray-200">This can't be undone.</span>
      </p>

      <label className="mt-5 block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="delete-account-password">
        Enter your password to confirm
      </label>
      <input
        id="delete-account-password"
        type="password"
        autoComplete="current-password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mt-1.5 w-full rounded-lg border-0 bg-gray-100 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-[#FF3B6B]/50 dark:bg-[#232329] dark:text-white"
        placeholder="Password"
      />
      {error && (
        <p role="alert" className="mt-2 text-sm text-[#FF3B6B]">
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
          disabled={!password || deleting}
          className="rounded-lg bg-[#FF3B6B] px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {deleting ? "Deleting…" : "Delete account"}
        </button>
      </div>
    </motion.form>
  );
}
