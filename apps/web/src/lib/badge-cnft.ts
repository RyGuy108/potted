import { createTreeV2, findLeafAssetIdPda, mintV2, mplBubblegum, parseLeafFromMintV2Transaction } from "@metaplex-foundation/mpl-bubblegum";
import { createCollection, mplCore } from "@metaplex-foundation/mpl-core";
import { type Umi, generateSigner, keypairIdentity, publicKey, some } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import type { Keypair } from "@solana/web3.js";

/**
 * Garden badges as compressed NFTs (Metaplex Bubblegum v2). Every badge is
 * a leaf in one Merkle tree, so minting one costs a fee and almost no rent
 * (thousands of badges for the price of a few regular NFTs). The badges sit
 * in an MPL-Core collection with a permanent freeze, so like the Token-2022
 * badges they are soulbound: they can never be sold or moved.
 *
 * Turned on with POTTED_BADGES=compressed plus BADGE_TREE and
 * BADGE_COLLECTION, which `pnpm badges:setup` creates once. Wallets and
 * explorers find compressed NFTs through an RPC with the DAS API (QuickNode's
 * DAS add-on, Helius and others).
 */

export function badgeUmi(rpcUrl: string, server: Keypair): Umi {
  return createUmi(rpcUrl).use(mplBubblegum()).use(mplCore()).use(keypairIdentity(fromWeb3JsKeypair(server)));
}

export function compressedBadgesOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.POTTED_BADGES === "compressed" && Boolean(env.BADGE_TREE && env.BADGE_COLLECTION);
}

/** BubblegumV2 lets the collection hold compressed assets; the permanent freeze, set to frozen, makes every badge in it soulbound. */
export const BADGE_COLLECTION_PLUGINS = [
  { type: "BubblegumV2" as const },
  { type: "PermanentFreezeDelegate" as const, frozen: true, authority: { type: "UpdateAuthority" as const } },
];

/**
 * One-time setup: the collection (frozen for good, so its badges are
 * soulbound) and the tree. Depth 14 holds 16,384 badges.
 */
export async function setupBadgeTree(umi: Umi, collectionUri: string, opts: { maxDepth?: number; maxBufferSize?: number; canopyDepth?: number } = {}): Promise<{ tree: string; collection: string }> {
  const collection = generateSigner(umi);
  await createCollection(umi, {
    collection,
    name: "Potted Garden Badges",
    uri: collectionUri,
    plugins: BADGE_COLLECTION_PLUGINS,
  }).sendAndConfirm(umi);
  const tree = generateSigner(umi);
  await (
    await createTreeV2(umi, { merkleTree: tree, maxDepth: opts.maxDepth ?? 14, maxBufferSize: opts.maxBufferSize ?? 64, canopyDepth: opts.canopyDepth ?? 0, public: false })
  ).sendAndConfirm(umi);
  return { tree: tree.publicKey.toString(), collection: collection.publicKey.toString() };
}

/** The mint instruction for one badge, before it is sent. */
export function mintBadgeBuilder(umi: Umi, where: { tree: string; collection: string }, owner: string, badge: { id: string; name: string; uri: string }) {
  const merkleTree = publicKey(where.tree);
  const coreCollection = publicKey(where.collection);
  return mintV2(umi, {
    leafOwner: publicKey(owner),
    merkleTree,
    coreCollection,
    metadata: {
      name: `Potted · ${badge.name}`.slice(0, 32),
      symbol: "POTTED",
      uri: badge.uri,
      sellerFeeBasisPoints: 0,
      collection: some(coreCollection),
      creators: [],
    },
  });
}

/** Mints one badge to a planter's wallet. Returns the asset id (what explorers and wallets show) and the transaction. */
export async function mintCompressedBadge(
  umi: Umi,
  where: { tree: string; collection: string },
  owner: string,
  badge: { id: string; name: string; uri: string },
): Promise<{ mint: string; tx: string }> {
  const merkleTree = publicKey(where.tree);
  const { signature } = await mintBadgeBuilder(umi, where, owner, badge).sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
  const leaf = await parseLeafFromMintV2Transaction(umi, signature);
  const [assetId] = findLeafAssetIdPda(umi, { merkleTree, leafIndex: leaf.nonce });
  return { mint: assetId.toString(), tx: base58.deserialize(signature)[0] };
}
