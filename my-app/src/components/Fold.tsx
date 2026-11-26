import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronUp } from "lucide-react";

// For a card that folds down to its title (the diagram's key and its flows):
// the body slides open and shut instead of popping, and the chevron turns
// rather than swapping icons. With reduced motion turned on, both just
// switch.

const EASE = [0.4, 0, 0.2, 1] as const;
const DURATION = 0.2;

export function FoldBody({ open, children }: { open: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    // initial={false}: a card that starts open shows open, without sliding in
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="body"
          data-fold-body
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: reduce ? 0 : DURATION, ease: EASE }}
          // clips the body while it slides; also keeps its top margin inside
          style={{ overflow: "hidden" }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Points up while folded (the card opens upward, from the corner it sits
// in) and down while open.
export function FoldChevron({ open }: { open: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      className="inline-flex"
      initial={false}
      animate={{ rotate: open ? 180 : 0 }}
      transition={{ duration: reduce ? 0 : DURATION, ease: EASE }}
    >
      <ChevronUp className="size-3.5" />
    </motion.span>
  );
}
