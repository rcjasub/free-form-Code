// Prints what the repo reader would hand the AI for a GitHub repo: the
// files it chose, the budget used and the facts it pulled out. For checking
// the reader by hand; not part of `npm test`.
//
//   npx ts-node scripts/readRepo.ts https://github.com/owner/repo
//   GITHUB_TOKEN=... npx ts-node scripts/readRepo.ts <url>   (private repos)
//   READ_REPO_JSON=1 ... prints the whole snapshot as JSON instead
//
// It uses Redis for caching if it's running; without it every run reads
// from GitHub (about 2 API calls of the 60 an hour allowed without a token).

import { readRepo, RepoReadError } from "../services/github";
import redis, { bullConnection } from "../redis";

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: npx ts-node scripts/readRepo.ts <github url>");
    process.exitCode = 1;
    return;
  }
  const started = Date.now();
  const snapshot = await readRepo(url, { token: process.env.GITHUB_TOKEN });
  const ms = Date.now() - started;

  if (process.env.READ_REPO_JSON) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  const chars = snapshot.files.reduce((sum, f) => sum + f.content.length, 0);
  const { source, facts } = snapshot;
  console.log(`${source.owner}/${source.repo} @ ${source.commitSha.slice(0, 7)} (${ms} ms)`);
  console.log(`tree: ${snapshot.tree.length} files${snapshot.treeTruncated ? " (truncated)" : ""}`);
  console.log(`read: ${snapshot.files.length} files, ${chars.toLocaleString()} chars`);
  for (const f of snapshot.files) console.log(`  ${f.truncated ? "✂" : " "} ${f.path} (${f.content.length})`);
  console.log("languages:", facts.languages.map((l) => `${l.language} ${l.files}`).join(", "));
  for (const p of facts.packages) console.log(`package ${p.path}: ${p.name ?? "-"} [${p.dependencies.length} deps] ${p.dependencies.slice(0, 12).join(", ")}`);
  for (const s of facts.composeServices) {
    console.log(`service ${s.name}: image=${s.image ?? "-"} build=${s.build ?? "-"} depends_on=[${s.dependsOn.join(", ")}] ports=[${s.ports.join(", ")}]`);
  }
  console.log(`routes: ${facts.routes.length}`);
  for (const r of facts.routes.slice(0, 25)) console.log(`  ${r.method} ${r.path}  (${r.file})`);
}

main()
  .catch((err) => {
    console.error(err instanceof RepoReadError ? `${err.code}: ${err.message}` : err);
    process.exitCode = 1;
  })
  .finally(() => {
    redis.disconnect();
    bullConnection.disconnect();
  });
