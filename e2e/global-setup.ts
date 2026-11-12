import { request, type FullConfig } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

// Signs up one account for the whole run and saves its login (a cookie) for
// the tests that need a canvas on the server: sign-up is rate-limited, so
// they share it instead of each making their own. Its password is kept too
// (only in .auth/, which git ignores), so global-teardown can delete the
// account afterwards. Accounts are named e2e_… so any leftovers in a local
// database (a run that crashed before teardown) are easy to find.
export const USER_STATE = ".auth/user.json";
export const USER_LOGIN_FILE = ".auth/account.json";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const username = `e2e_${Date.now()}`;
  // made up fresh every run: no password lives in the repo
  const password = randomBytes(18).toString("base64url");
  const api = await request.newContext({ baseURL });
  const res = await api.post("/api/auth/register", {
    data: { username, email: `${username}@example.com`, password },
  });
  if (!res.ok()) throw new Error(`couldn't sign up the test account: ${res.status()} ${await res.text()}`);
  mkdirSync(".auth", { recursive: true });
  await api.storageState({ path: USER_STATE });
  writeFileSync(USER_LOGIN_FILE, JSON.stringify({ password }));
  await api.dispose();
}
