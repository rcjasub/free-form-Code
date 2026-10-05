import { isAxiosError } from "axios";

// A save the server turned down, carrying the reason it gave.
export class SaveRejectedError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function serverReason(body: unknown): string | undefined {
  const b = body as { error?: unknown; errors?: { message?: unknown }[] } | null;
  const reason = b?.error ?? b?.errors?.[0]?.message;
  return typeof reason === "string" ? reason : undefined;
}

// fetch() resolves even when the server says no (a full canvas, a rate limit),
// so a caller that just reads res.json() would treat the error body as the
// saved block. This throws instead, with the server's reason.
export async function jsonOrThrow(res: Response) {
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new SaveRejectedError(serverReason(body) ?? "", res.status);
  return body;
}

// What to tell the user when a save fails: the server's own reason for a 4xx
// ("This canvas is full…", "Too many new blocks, try again in a minute"), so
// they know why — otherwise (network down, server error) the caller's fallback.
export function saveErrorMessage(err: unknown, fallback: string): string {
  let status: number | undefined;
  let reason: string | undefined;
  if (err instanceof SaveRejectedError) {
    status = err.status;
    reason = err.message;
  } else if (isAxiosError(err)) {
    status = err.response?.status;
    reason = serverReason(err.response?.data);
  }
  return status !== undefined && status >= 400 && status < 500 && reason ? reason : fallback;
}
