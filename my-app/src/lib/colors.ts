// Diagram and text colors. A color is saved as a name from this palette and
// drawn in the shade that suits the theme. The palette is open-color's: a
// deep shade for lines and text, and a pale one of the same hue for fills.
// On the dark canvas each is drawn as it looks under an inverting filter
// (invert 93%, then hue-rotate 180°), so the hue stays and the lightness
// flips: lines get lighter, fills turn into deep tones that light text
// still reads on. "auto" is the theme's own text color. Anything else (a
// hex code from before the palette) is drawn as-is.
export const AUTO = "auto";
export const TRANSPARENT = "transparent";

interface Shade {
  dark: string;
  light: string;
}

// The swatches, in order: red, green, blue, yellow.
const SWATCHES: Record<string, { stroke: Shade; fill: Shade }> = {
  red: { stroke: { light: "#e03131", dark: "#ff8383" }, fill: { light: "#ffc9c9", dark: "#5b2d2d" } },
  green: { stroke: { light: "#2f9e44", dark: "#3a994c" }, fill: { light: "#b2f2bb", dark: "#043b0c" } },
  blue: { stroke: { light: "#1971c2", dark: "#56a2e8" }, fill: { light: "#a5d8ff", dark: "#154163" } },
  yellow: { stroke: { light: "#f08c00", dark: "#b76100" }, fill: { light: "#ffec99", dark: "#362600" } },
};

// Names from the first palette, which blocks may still be saved with. They
// keep drawing, in the nearest open-color hue, but aren't offered anymore.
const RETIRED: Record<string, { stroke: Shade; fill: Shade }> = {
  cyan: { stroke: { light: "#0c8599", dark: "#3da5b6" }, fill: { light: "#99e9f2", dark: "#004149" } },
  pink: { stroke: { light: "#c2255c", dark: "#ff8dbc" }, fill: { light: "#fcc2d7", dark: "#602e41" } },
  purple: { stroke: { light: "#6741d9", dark: "#b595ff" }, fill: { light: "#d0bfff", dark: "#493b72" } },
  orange: { stroke: { light: "#e8590c", dark: "#f17634" }, fill: { light: "#ffd8a8", dark: "#4d2b02" } },
};

function entry(color: string) {
  return SWATCHES[color] ?? RETIRED[color];
}

// A line's or text's color.
export function themeColor(color: string, isDark: boolean) {
  if (color === AUTO) return isDark ? "#f5f5f5" : "#1f2937";
  const shade = entry(color)?.stroke;
  return shade ? (isDark ? shade.dark : shade.light) : color;
}

// A fill's color: the pale shade of the name.
export function fillColor(color: string, isDark: boolean) {
  if (color === AUTO) return themeColor(color, isDark);
  const shade = entry(color)?.fill;
  return shade ? (isDark ? shade.dark : shade.light) : color;
}

const NAMED = Object.keys(SWATCHES);

// Both rows offer the same hues: deep for strokes, pale for fills.
export const STROKE_COLORS = [AUTO, ...NAMED];
export const FILL_COLORS = [TRANSPARENT, ...NAMED];

// Readable names for the swatches' tooltips.
export function colorName(color: string) {
  if (color === AUTO) return "Default";
  if (color === TRANSPARENT) return "None";
  return entry(color) ? color[0].toUpperCase() + color.slice(1) : color;
}
