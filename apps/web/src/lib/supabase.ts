import type { Db } from "./store";

/**
 * Off-chain data in Supabase. The app keeps working from memory, as it
 * always has; this module loads that state from Postgres when the server
 * starts and writes back whatever changed after each save.
 *
 * Profiles, challenges (with their text and terms), pledges and clips get
 * tables of their own, so they can be queried and browsed in Supabase.
 * Everything else (events, notices, settings, points and the rest) is one
 * JSON row in `app_state`.
 *
 * Talks to Supabase's REST API with the service role key, so it needs no
 * client library. The tables are in supabase/migrations.
 */

export interface SupabaseDeps {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
}

const defaults = (): SupabaseDeps => ({ fetch: globalThis.fetch, env: process.env });

export function supabaseConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

type Row = Record<string, unknown> & { id: string };

/** The rows each table should hold for a given state. */
export function rowsOf(state: Db): Record<Table, Row[]> {
  const { users, challenges, pledges, ...rest } = state;
  return {
    profiles: users.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      handle: u.handle ?? null,
      wallet: u.wallet,
      created_at: new Date(u.createdAt).toISOString(),
      data: u,
    })),
    challenges: challenges.map((c) => ({
      id: c.id,
      streamer_id: c.streamerId,
      game_id: c.gameId,
      title: c.title,
      status: c.status,
      total_micro: c.totalMicro,
      goal_micro: c.goalMicro,
      created_at: new Date(c.createdAt).toISOString(),
      settled_at: c.settledAt ? new Date(c.settledAt).toISOString() : null,
      data: c,
    })),
    pledges: pledges.map((p) => ({ id: p.id, challenge_id: p.challengeId, user_id: p.userId, amount_micro: p.amountMicro, data: p })),
    clips: challenges.flatMap((c) =>
      c.claim
        ? [{
            id: c.id,
            challenge_id: c.id,
            streamer_id: c.streamerId,
            url: c.claim.clipUrl,
            claimed_at: new Date(c.claim.claimedAt).toISOString(),
            disputes: c.claim.disputedBy.length,
            ruling: c.claim.ruling ?? null,
          }]
        : [],
    ),
    app_state: [{ id: "state", data: rest }],
  };
}

const TABLES = ["profiles", "challenges", "pledges", "clips", "app_state"] as const;
type Table = (typeof TABLES)[number];

async function rest(deps: SupabaseDeps, pathAndQuery: string, init: RequestInit = {}): Promise<Response> {
  const base = deps.env.SUPABASE_URL!.replace(/\/+$/, "");
  const key = deps.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await deps.fetch(`${base}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Supabase ${init.method ?? "GET"} ${pathAndQuery.split("?")[0]} returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

const PAGE = 1000;

async function readAll(deps: SupabaseDeps, table: Table): Promise<Row[]> {
  const out: Row[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await rest(deps, `${table}?select=*&order=id&limit=${PAGE}&offset=${offset}`);
    const page = (await res.json()) as Row[];
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

/** What was last written, per table and row, so each sync sends only changes. */
const sent = new Map<Table, Map<string, string>>();

/** Loads the whole state, or null when Supabase has none yet (the first run). */
export async function loadFromSupabase(deps: SupabaseDeps = defaults()): Promise<Db | null> {
  const [profiles, challenges, pledges, clips, appState] = await Promise.all(TABLES.map((t) => readAll(deps, t)));
  const state = appState?.find((r) => r.id === "state");
  if (!state) return null;
  const loaded = {
    ...(state.data as Omit<Db, "users" | "challenges" | "pledges">),
    users: profiles!.map((r) => r.data),
    challenges: challenges!.map((r) => r.data),
    pledges: pledges!.map((r) => r.data),
  } as Db;
  // Remember what is there now, so the first save only sends changes.
  const rows = rowsOf(loaded);
  for (const t of TABLES) sent.set(t, new Map(rows[t].map((r) => [r.id, JSON.stringify(r)])));
  void clips;
  return loaded;
}

const CHUNK = 500;

/** Writes the rows that changed since the last sync and deletes the ones that are gone. */
export async function syncToSupabase(state: Db, deps: SupabaseDeps = defaults()): Promise<{ upserted: number; deleted: number }> {
  const rows = rowsOf(state);
  let upserted = 0;
  let deleted = 0;
  for (const table of TABLES) {
    const before = sent.get(table) ?? new Map<string, string>();
    const now = new Map(rows[table].map((r) => [r.id, JSON.stringify(r)]));
    const changed = rows[table].filter((r) => before.get(r.id) !== now.get(r.id));
    for (let i = 0; i < changed.length; i += CHUNK) {
      await rest(deps, `${table}?on_conflict=id`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(changed.slice(i, i + CHUNK)),
      });
    }
    const gone = [...before.keys()].filter((id) => !now.has(id));
    for (let i = 0; i < gone.length; i += 100) {
      const ids = gone.slice(i, i + 100).map((id) => `"${id.replace(/"/g, "")}"`).join(",");
      await rest(deps, `${table}?id=in.(${encodeURIComponent(ids)})`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    }
    sent.set(table, now);
    upserted += changed.length;
    deleted += gone.length;
  }
  return { upserted, deleted };
}

let timer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<unknown> = Promise.resolve();

/** Called after every save: batches quick saves into one sync. */
export function scheduleSync(state: () => Db, deps: SupabaseDeps = defaults()): void {
  if (!supabaseConfigured(deps.env)) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    running = running.then(() => syncToSupabase(state(), deps)).catch((err) => console.error("[supabase]", err instanceof Error ? err.message : err));
  }, 250);
}

/** Waits for pending writes; scripts call this before they exit. */
export async function flushSupabase(state: () => Db, deps: SupabaseDeps = defaults()): Promise<void> {
  if (!supabaseConfigured(deps.env)) return;
  if (timer) {
    clearTimeout(timer);
    timer = undefined;
    running = running.then(() => syncToSupabase(state(), deps));
  }
  await running;
}

/** Test hook. */
export function resetSupabaseForTests(): void {
  sent.clear();
  clearTimeout(timer);
  timer = undefined;
  running = Promise.resolve();
}
