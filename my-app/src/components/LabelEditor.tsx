import { useEffect, useRef } from "react";

// Typing a shape's or an arrow's label, in place. Enter makes a new line;
// clicking away, Escape or Ctrl/Cmd+Enter finishes. `onDone` gets the text
// and its height (in canvas px: the element's layout size, which the canvas
// zoom doesn't change).
export default function LabelEditor({ initial, onDone }: { initial: string; onDone: (text: string, height: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = initial;
    el.focus();
    // the caret goes at the end, ready to add to what's there
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    // closed without losing focus first (the editing moved elsewhere): keep
    // what was typed
    // (the element is passed in: the ref is already cleared by then)
    return () => finishRef.current(el);
    // set once: React doesn't own what's typed in here
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function finish(el = ref.current) {
    if (done.current || !el) return;
    done.current = true;
    onDone(el.innerText, el.offsetHeight);
  }
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  return (
    <div
      ref={ref}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      className="outline-none max-w-full"
      style={{ minWidth: "1ch", cursor: "text" }}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={() => finish()}
      onKeyDown={(e) => {
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          // Ctrl+Enter also runs selected code (App): not the label
          e.stopPropagation();
          e.currentTarget.blur(); // finishes (onBlur)
        }
      }}
    />
  );
}
