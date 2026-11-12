import { request, type FullConfig } from "@playwright/test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { USER_LOGIN_FILE, USER_STATE } from "./global-setup";

// Deletes the run's shared account (global-setup), with everything the tests
// made on it, through the same endpoint people use: a run leaves nothing
// behind in the database. A failure here only warns; the tests' results
// stand either way.
export default async function globalTeardown(config: FullConfig) {
  if (!existsSync(USER_STATE) || !existsSync(USER_LOGIN_FILE)) return;
  const baseURL = config.projects[0].use.baseURL!;
  const { password } = JSON.parse(readFileSync(USER_LOGIN_FILE, "utf8")) as { password: string };
  const api = await request.newContext({ baseURL, storageState: USER_STATE });
  const res = await api.delete("/api/auth/me", { data: { password } });
  if (!res.ok()) console.warn(`couldn't delete the test account: ${res.status()} ${await res.text()}`);
  await api.dispose();
  rmSync(".auth", { recursive: true, force: true });
}
