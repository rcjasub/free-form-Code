// Diagram and text colors. A color is saved as a name from this palette, and
// drawn in the shade that suits the theme: the bright Dracula tones (the
// same family as the code blocks' syntax colors) on the dark canvas, deeper
// ones on the light canvas, where the bright ones would wash out. "auto" is
// the theme's own text color. Anything else (a hex code from before the
// palette) is drawn as-is.
export const AUTO = "auto";
export const TRANSPARENT = "transparent";

const PALETTE: Record<string, { dark: string; light: string }> = {
  cyan: { dark: "#8be9fd", light: "#0e7490" },
  green: { dark: "#50fa7b", light: "#15803d" },
  orange: { dark: "#ffb86c", light: "#c2410c" },
  pink: { dark: "#ff79c6", light: "#be185d" },
  purple: { dark: "#bd93f9", light: "#6d28d9" },
};

export function themeColor(color: string, isDark: boolean) {
  if (color === AUTO) return isDark ? "#f5f5f5" : "#1f2937";
  const shade = PALETTE[color];
  return shade ? (isDark ? shade.dark : shade.light) : color;
}

const NAMED = Object.keys(PALETTE);

// The swatches. A fill is drawn as a soft tint of its color (or a dot or
// stripe pattern in it), so the same names serve both rows.
export const STROKE_COLORS = [AUTO, ...NAMED];
export const FILL_COLORS = [TRANSPARENT, ...NAMED];

// Readable names for the swatches' tooltips.
export function colorName(color: string) {
  if (color === AUTO) return "Default";
  if (color === TRANSPARENT) return "None";
  return color in PALETTE ? color[0].toUpperCase() + color.slice(1) : color;
}
