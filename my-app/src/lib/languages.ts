import type { Extension } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";

// Must match LANGUAGES in backend/sandbox.ts — the backend rejects anything else.
export type Language = "javascript" | "python" | "cpp" | "java";

export const LANGUAGE_OPTIONS: {
  id: Language;
  label: string;
  highlight: () => Extension;
  // Inserted when an empty block switches to this language.
  starter?: string;
}[] = [
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
  return LANGUAGE_OPTIONS.find((l) => l.id === id) ?? LANGUAGE_OPTIONS[0];
}
