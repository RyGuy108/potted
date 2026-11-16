import type { Deps } from "../src";

/** A fetch that answers from a canned body and records what was asked. */
export function fakeDeps(
  body: unknown,
  opts: { status?: number; env?: Record<string, string> } = {},
): Deps & { calls: { url: string; headers: Record<string, string> }[] } {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetch = (async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url: String(url), headers: init?.headers ?? {} });
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(text, { status: opts.status ?? 200 });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, env: opts.env ?? {}, calls };
}
