// Browser-side fetch helper: returns parsed JSON or throws with the server's message.
export class ApiError extends Error { constructor(public code: string, message: string, public status: number) { super(message); } }

export async function api<T = unknown>(path: string, init?: RequestInit & { body?: BodyInit | null }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json", ...init?.headers } : init?.headers });
  } catch {
    throw new ApiError("network", "Can't reach the server. Check your connection; the battle continues on the server.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error?.code ?? "error", data?.error?.message ?? `Request failed (${res.status}).`, res.status);
  return data as T;
}
export const post = <T = unknown>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
