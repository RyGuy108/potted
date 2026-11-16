import type { Condition, Verdict } from "@potted/core";
import { brawlStarsAdapter } from "./brawlstars";
import { fortniteAdapter } from "./fortnite";
import { lichessAdapter } from "./lichess";
import { optimisticAdapter } from "./optimistic";
import { steamAdapter } from "./steam";
import type { Adapter, CheckContext, Deps } from "./types";

export * from "./types";
export { lichessAdapter, brawlStarsAdapter, fortniteAdapter, optimisticAdapter, steamAdapter };

/** Adding a game means adding one adapter here. Nothing else changes. */
const ADAPTERS: { [K in Condition["kind"]]: Adapter<Extract<Condition, { kind: K }>> } = {
  lichess: lichessAdapter,
  brawlstars: brawlStarsAdapter,
  fortnite: fortniteAdapter,
  steam: steamAdapter,
  optimistic: optimisticAdapter,
};

function adapterFor(condition: Condition): Adapter {
  return ADAPTERS[condition.kind] as unknown as Adapter;
}

export function defaultDeps(): Deps {
  return { fetch: globalThis.fetch, env: process.env };
}

/** Takes the adapter's baseline reading at lock, if it needs one. */
export async function snapshot(condition: Condition, deps: Deps = defaultDeps()): Promise<unknown> {
  return adapterFor(condition).snapshot?.(condition, deps);
}

export async function verify(
  condition: Condition,
  ctx: CheckContext,
  deps: Deps = defaultDeps(),
): Promise<Verdict> {
  return adapterFor(condition).check(condition, ctx, deps);
}
