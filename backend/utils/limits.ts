// Storage limits. Each can be tightened with an environment variable, so a
// small public deployment (the demo VM) can cap how much one account can
// store, while running it yourself, locally or self-hosted, keeps the
// relaxed defaults. Unset, empty or invalid values fall back to the default.

// A whole number from the environment: `fallback` when unset or not a
// non-negative integer.
export function envInt(name: string, fallback: number, env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

// Canvases one signed-up account can own. 0 (the default) means no limit.
// Guests always get just one (see createCanvas).
export const MAX_CANVASES_PER_USER = envInt("MAX_CANVASES_PER_USER", 0);

// Blocks one canvas can hold.
export const MAX_BLOCKS_PER_CANVAS = envInt("MAX_BLOCKS_PER_CANVAS", 500);

// Total content one canvas can hold, in MB (counted in characters, so a
// little over the bytes for plain text). Images are what fill it.
export const MAX_CANVAS_CONTENT = envInt("MAX_CANVAS_CONTENT_MB", 50) * 1_000_000;
