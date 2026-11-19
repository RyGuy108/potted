import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { BADGE_COLLECTION_PLUGINS, badgeUmi, compressedBadgesOn, mintBadgeBuilder } from "../src/lib/badge-cnft";

const BUBBLEGUM = "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY";

describe("compressed NFT badges", () => {
  it("are on only with the tree and collection set", () => {
    expect(compressedBadgesOn({})).toBe(false);
    expect(compressedBadgesOn({ POTTED_BADGES: "compressed", BADGE_TREE: "t" })).toBe(false);
    expect(compressedBadgesOn({ POTTED_BADGES: "compressed", BADGE_TREE: "t", BADGE_COLLECTION: "c" })).toBe(true);
  });

  it("live in a frozen collection, so they are soulbound", () => {
    expect(BADGE_COLLECTION_PLUGINS).toContainEqual(expect.objectContaining({ type: "PermanentFreezeDelegate", frozen: true }));
    expect(BADGE_COLLECTION_PLUGINS).toContainEqual({ type: "BubblegumV2" });
  });

  it("mint one Bubblegum v2 leaf to the planter, in the collection, paid and signed by the server", () => {
    const server = Keypair.generate();
    const umi = badgeUmi("http://127.0.0.1:8899", server);
    const tree = Keypair.generate().publicKey.toBase58();
    const collection = Keypair.generate().publicKey.toBase58();
    const owner = Keypair.generate().publicKey.toBase58();
    const builder = mintBadgeBuilder(umi, { tree, collection }, owner, { id: "first-bean", name: "First bean", uri: "https://potted.example/api/badges/first-bean" });
    const [ix] = builder.getInstructions();
    expect(builder.getInstructions()).toHaveLength(1);
    expect(ix!.programId.toString()).toBe(BUBBLEGUM);
    const keys = ix!.keys.map((k) => k.pubkey.toString());
    expect(keys).toEqual(expect.arrayContaining([tree, collection, owner, server.publicKey.toBase58()]));
    expect(builder.getSigners(umi).map((s) => s.publicKey.toString())).toEqual([server.publicKey.toBase58()]);
    // The name, link and the collection are in the instruction data.
    const data = Buffer.from(ix!.data).toString("utf8");
    expect(data).toContain("Potted · First bean");
    expect(data).toContain("https://potted.example/api/badges/first-bean");
  });
});
