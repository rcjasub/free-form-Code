// Reads a GitHub repo and asks Claude for its architecture: the whole
// pipeline up to the diagram, from the terminal. For trying the AI by hand;
// not part of `npm test`, and each run costs a little (it uses your key).
//
//   npx ts-node scripts/generateArchitecture.ts <github url>
//
// with ANTHROPIC_API_KEY=sk-ant-... in backend/.env or the environment.
//
// Options (env vars):
//   AI_MODEL       default claude-sonnet-5-5; claude-opus-5-5 for a more careful diagram
//   AI_EFFORT      low | medium | high | xhigh | max   default medium
//   GITHUB_TOKEN   for private repos or more GitHub calls
//   OUT            also write the model as JSON to this file

// Reads ANTHROPIC_API_KEY (and the rest) from backend/.env, which git
// ignores. The server never uses that key: the app sends each user's own.
import "dotenv/config";
import { writeFileSync } from "fs";
import { readRepo, RepoReadError } from "../services/github";
import { AiError, generateArchitecture, type GenerateOptions } from "../services/ai";
import redis, { bullConnection } from "../redis";

async function main() {
  const url = process.argv[2];
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  if (!url || !apiKey) {
    console.error("Usage: ANTHROPIC_API_KEY=sk-ant-... npx ts-node scripts/generateArchitecture.ts <github url>");
    process.exitCode = 1;
    return;
  }

  let started = Date.now();
  const snapshot = await readRepo(url, { token: process.env.GITHUB_TOKEN });
  console.log(`read ${snapshot.source.owner}/${snapshot.source.repo} @ ${snapshot.source.commitSha.slice(0, 7)}: ${snapshot.files.length} files (${Date.now() - started} ms)`);

  started = Date.now();
  const result = await generateArchitecture(snapshot, {
    apiKey,
    model: process.env.AI_MODEL || undefined,
    effort: (process.env.AI_EFFORT as GenerateOptions["effort"]) || undefined,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  const { model, usage } = result;
  console.log(`\n${model.summary}\n`);
  const children = new Map<string, string[]>();
  for (const s of model.sections) if (s.parentId) children.set(s.parentId, [...(children.get(s.parentId) ?? []), s.id]);
  const print = (id: string, depth: number) => {
    const s = model.sections.find((x) => x.id === id)!;
    const pad = "  ".repeat(depth);
    console.log(`${pad}[${s.kind}] ${s.title} (${s.id})`);
    console.log(`${pad}    ${s.summary}`);
    if (s.files.length) console.log(`${pad}    files: ${s.files.slice(0, 8).join(", ")}${s.files.length > 8 ? ", …" : ""}`);
    for (const child of children.get(id) ?? []) print(child, depth + 1);
  };
  for (const s of model.sections.filter((x) => !x.parentId)) print(s.id, 0);
  console.log("\nedges:");
  for (const e of model.edges) console.log(`  ${e.from} → ${e.to}${e.label ? `  (${e.label})` : ""}`);
  if (result.warnings.length) console.log("\ncleaned up:\n  " + result.warnings.join("\n  "));
  console.log(
    `\n${model.sections.length} sections, ${model.edges.length} edges | ${result.servedBy}, ${result.attempts} attempt(s), ${seconds} s | ` +
      `tokens: ${usage.inputTokens} in, ${usage.cacheWriteTokens} cache write, ${usage.cacheReadTokens} cache read, ${usage.outputTokens} out`,
  );
  if (process.env.OUT) {
    writeFileSync(process.env.OUT, JSON.stringify(model, null, 2));
    console.log(`wrote ${process.env.OUT}`);
  }
}

main()
  .catch((err) => {
    if (err instanceof AiError) console.error(`${err.code}: ${err.message}${err.details.length ? "\n  " + err.details.join("\n  ") : ""}`);
    else if (err instanceof RepoReadError) console.error(`${err.code}: ${err.message}`);
    else console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    redis.disconnect();
    bullConnection.disconnect();
  });
