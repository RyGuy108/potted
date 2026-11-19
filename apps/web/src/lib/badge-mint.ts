import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AuthorityType,
  ExtensionType,
  LENGTH_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TYPE_SIZE,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createInitializeNonTransferableMintInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
} from "@solana/spl-token";
import { type TokenMetadata, createInitializeInstruction, createUpdateFieldInstruction, pack } from "@solana/spl-token-metadata";
import { type Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";

/**
 * Garden badges as soulbound tokens on Solana: one Token-2022 mint per
 * badge, with the name, picture link and badge id stored on the mint itself
 * (the metadata extension), the non-transferable extension so a badge can
 * never be sold or moved, and a supply of exactly one (the mint authority is
 * dropped in the same transaction). The server pays the fee and rent.
 */
export async function mintBadge(
  connection: Connection,
  server: Keypair,
  owner: string,
  badge: { id: string; name: string; uri: string },
): Promise<{ mint: string; tx: string }> {
  const mint = Keypair.generate();
  const holder = new PublicKey(owner);
  const metadata: TokenMetadata = {
    mint: mint.publicKey,
    updateAuthority: server.publicKey,
    name: `Potted · ${badge.name}`.slice(0, 32),
    symbol: "POTTED",
    uri: badge.uri,
    additionalMetadata: [["badge", badge.id]],
  };
  const mintLen = getMintLen([ExtensionType.NonTransferable, ExtensionType.MetadataPointer]);
  const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataLen);
  const account = getAssociatedTokenAddressSync(mint.publicKey, holder, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

  const tx = new Transaction().add(
    SystemProgram.createAccount({ fromPubkey: server.publicKey, newAccountPubkey: mint.publicKey, space: mintLen, lamports, programId: TOKEN_2022_PROGRAM_ID }),
    createInitializeNonTransferableMintInstruction(mint.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializeMetadataPointerInstruction(mint.publicKey, server.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(mint.publicKey, 0, server.publicKey, null, TOKEN_2022_PROGRAM_ID),
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      updateAuthority: server.publicKey,
      mint: mint.publicKey,
      mintAuthority: server.publicKey,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadata.uri,
    }),
    createUpdateFieldInstruction({ programId: TOKEN_2022_PROGRAM_ID, metadata: mint.publicKey, updateAuthority: server.publicKey, field: "badge", value: badge.id }),
    createAssociatedTokenAccountIdempotentInstruction(server.publicKey, account, holder, mint.publicKey, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID),
    createMintToInstruction(mint.publicKey, account, server.publicKey, 1, [], TOKEN_2022_PROGRAM_ID),
    createSetAuthorityInstruction(mint.publicKey, server.publicKey, AuthorityType.MintTokens, null, [], TOKEN_2022_PROGRAM_ID),
  );
  const signature = await sendAndConfirmTransaction(connection, tx, [server, mint], { commitment: "confirmed" });
  return { mint: mint.publicKey.toBase58(), tx: signature };
}

/** Where to see a badge's token in an explorer. */
export function badgeExplorerUrl(mint: string): string {
  const cluster = process.env.SOLANA_CLUSTER || "devnet";
  return `https://explorer.solana.com/address/${mint}${cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`}`;
}
