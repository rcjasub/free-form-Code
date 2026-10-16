import type { Extension } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";

// Runnable languages must match LANGUAGES in backend/sandbox.ts; "text" is a
// plain note that never runs (languageSchema in backend/schemas/block.schema.ts).
export type Language = "javascript" | "python" | "cpp" | "java" | "text";

export const LANGUAGE_OPTIONS: {
  id: Language;
  label: string;
  highlight: () => Extension;
  // Inserted when an empty block switches to this language.
  starter?: string;
}[] = [
  // No highlighting — just words.
  { id: "text", label: "Plain text", highlight: () => [] },
  { id: "javascript", label: "JavaScript", highlight: javascript },
  { id: "python", label: "Python", highlight: python },
  {
    id: "cpp",
    label: "C++",
    highlight: cpp,
    starter: "#include <iostream>\n\nint main() {\n  std::cout << \"Hello\" << std::endl;\n}\n",
  },
  {
    id: "java",
    label: "Java",
    highlight: java,
    // Java needs a class with a main method to run at all.
    starter:
      "public class Main {\n  public static void main(String[] args) {\n    System.out.println(\"Hello\");\n  }\n}\n",
  },
];

export function languageOption(id: string | undefined) {
  // Falls back to JavaScript (what blocks default to), not the first entry.
  return LANGUAGE_OPTIONS.find((l) => l.id === id) ?? LANGUAGE_OPTIONS.find((l) => l.id === "javascript")!;
}

export function isRunnable(id: string | undefined) {
  return id !== "text";
}
