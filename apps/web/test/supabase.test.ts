import { beforeEach, describe, expect, it } from "vitest";
import { loadFromSupabase, resetSupabaseForTests, syncToSupabase, type SupabaseDeps } from "@/lib/supabase";
import { type Db, db, resetForTests } from "@/lib/store";

/** A tiny stand-in for Supabase's REST API: upsert, delete by id list, and paged select. */
function fakeSupabase() {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  const calls: string[] = [];
  const table = (name: string) => tables.get(name) ?? tables.set(name, new Map()).get(name)!;
  const deps: SupabaseDeps = {
    env: { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service" },
    fetch: (async (input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      const name = url.pathname.split("/").pop()!;
      const method = init.method ?? "GET";
      calls.push(`${method} ${name}`);
      expect((init.headers as Record<string, string>).apikey).toBe("service");
      if (method === "POST") {
        for (const row of JSON.parse(String(init.body)) as Record<string, unknown>[]) table(name).set(String(row.id), row);
        return new Response(null, { status: 201 });
      }
      if (method === "DELETE") {
        const ids = decodeURIComponent(url.searchParams.get("id")!).slice(4, -1).split(",").map((s) => s.replace(/"/g, ""));
        for (const id of ids) table(name).delete(id);
        return new Response(null, { status: 204 });
      }
      const limit = Number(url.searchParams.get("limit"));
      const offset = Number(url.searchParams.get("offset"));
      return new Response(JSON.stringify([...table(name).values()].slice(offset, offset + limit)));
    }) as typeof fetch,
  };
  return { deps, tables, calls };
}

describe("supabase store", () => {
  beforeEach(() => {
    resetForTests();
    resetSupabaseForTests();
  });

  it("is empty on the first run, then round-trips the whole state", async () => {
    const sb = fakeSupabase();
    expect(await loadFromSupabase(sb.deps)).toBeNull();
    const state: Db = db();
    state.users.push({ id: "u_fan", name: "Maya", role: "fan", wallet: "sim:u_fan", createdAt: 1 });
    state.events.push({ seq: 1, at: 2, type: "recap", handle: "ryan", challengeId: "", message: "hi" });
    await syncToSupabase(state, sb.deps);
    expect(sb.tables.get("profiles")!.get("u_fan")!.name).toBe("Maya");

    resetSupabaseForTests();
    const loaded = await loadFromSupabase(sb.deps);
    expect(loaded!.users.map((u) => u.id)).toEqual(state.users.map((u) => u.id).sort());
    expect(loaded!.events[0]!.message).toBe("hi");
  });

  it("sends only changed rows and deletes removed ones", async () => {
    const sb = fakeSupabase();
    const state = db();
    state.users.push({ id: "u_a", name: "A", role: "fan", wallet: "w", createdAt: 1 }, { id: "u_b", name: "B", role: "fan", wallet: "w", createdAt: 1 });
    await syncToSupabase(state, sb.deps);
    state.users = state.users.filter((u) => u.id !== "u_b");
    state.users.find((u) => u.id === "u_a")!.name = "Ana";
    const result = await syncToSupabase(state, sb.deps);
    expect(result).toEqual({ upserted: 1, deleted: 1 });
    expect(sb.tables.get("profiles")!.has("u_b")).toBe(false);
    expect(sb.tables.get("profiles")!.get("u_a")!.name).toBe("Ana");
  });
});
