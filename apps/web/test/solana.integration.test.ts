import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMint } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Runs the app's own service code against the escrow program on a real
 * validator. Skipped unless SOLANA_TEST_RPC points at a validator that has
 * the program loaded at SOLANA_TEST_PROGRAM_ID. See programs/escrow/README.md.
 *
 *   solana-test-validator --reset --bpf-program <id> target/deploy/escrow.so
 *   SOLANA_TEST_RPC=http://127.0.0.1:8899 SOLANA_TEST_PROGRAM_ID=<id> pnpm --filter @potted/web test:solana
 */
const RPC = process.env.SOLANA_TEST_RPC;

describe.skipIf(!RPC)("Solana ledger against a local validator", () => {
  let service: typeof import("../src/lib/service");
  let ledger: typeof import("../src/lib/ledger");
  const usd = (n: number) => Math.round(n * 1_000_000);

  beforeAll(async () => {
    const connection = new Connection(RPC!, "confirmed");
    const server = Keypair.generate();
    const sig = await connection.requestAirdrop(server.publicKey, 20 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    const mint = await createMint(connection, server, server.publicKey, null, 6);
    Object.assign(process.env, {
      POTTED_LEDGER: "solana",
      SOLANA_RPC_URL: RPC,
      POTTED_PROGRAM_ID: process.env.SOLANA_TEST_PROGRAM_ID,
      VERIFIER_SECRET_KEY: JSON.stringify([...server.secretKey]),
      USDC_MINT: mint.toBase58(),
      POTTED_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "potted-solana-")),
      POTTED_ALLOW_SIMULATED_RESULTS: "true",
    });
    ledger = await import("../src/lib/ledger");
    service = await import("../src/lib/service");
    (await import("../src/lib/store")).resetForTests();
  }, 60_000);

  const clip = (statement = "Finish the first heist without getting busted") => ({
    gameId: "gta6",
    condition: { kind: "optimistic", game: "GTA VI", statement, disputeWindowSecs: 60 },
    goalUsd: 10,
    pledgeCapUsd: 10,
    minutes: 30,
  });
  const streamer = () => service.getStreamer("ryan")!;

  it("funds a planter, escrows pledges and pays the pot out on a completed challenge", async () => {
    const maya = await service.signIn("Maya", "fan");
    expect(maya.wallet).not.toMatch(/^sim:/);
    expect(streamer().wallet).not.toMatch(/^sim:/);
    expect(await service.balanceOf(maya)).toBe(usd(25));

    const c = await service.createChallenge(streamer(), clip());
    expect(c.ledgerRef).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}:/);
    await service.pledge(maya, c.id, 6);
    await service.pledge(maya, c.id, 2);
    expect(await service.balanceOf(maya)).toBe(usd(17));
    await expect(service.pledge(maya, c.id, 3)).rejects.toThrow();

    await service.lock(streamer(), c.id);
    await service.claim(streamer(), c.id, "https://clips.example.com/heist");
    const paid = await service.simulateResult(streamer(), c.id, true);
    expect(paid.status).toBe("paid");
    expect(paid.txs.settle).toMatch(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/);
    expect(await service.balanceOf(streamer())).toBe(usd(8));
    expect(await ledger.ledger().balanceOf(c.ledgerRef!.split(":")[0]!)).toBe(0);
  }, 120_000);

  it("refunds a fan's several pledges in one on-chain refund when cancelled", async () => {
    const ben = await service.signIn("Ben", "fan");
    const c = await service.createChallenge(streamer(), clip("Win a street race on stream"));
    await service.pledge(ben, c.id, 1);
    await service.pledge(ben, c.id, 2);
    expect(await service.balanceOf(ben)).toBe(usd(22));
    const before = await service.balanceOf(streamer());
    await service.cancel(streamer(), c.id);
    expect(await service.balanceOf(ben)).toBe(usd(25));
    expect(await service.balanceOf(streamer())).toBe(before);
  }, 120_000);

  it("pays collab and charity shares straight from escrow, by splits fixed when the challenge opened", async () => {
    const ana = await service.signIn("Ana", "fan");
    const kai = service.getStreamer("kai")!;
    await service.updateSettings(streamer(), { ...service.settingsOf(streamer()), causeOn: true, causeName: "Austin Pets Alive", causePct: 20 });
    const invite = await service.invite(streamer(), "kai", 30, clip("Escape a five star wanted level"));
    const c = (await service.respondInvite(kai, invite.id, true))!;
    const hostBefore = await service.balanceOf(streamer());
    await service.pledge(ana, c.id, 10);
    await service.lock(streamer(), c.id);
    await service.claim(streamer(), c.id, "https://clips.example.com/escape");
    await service.simulateResult(streamer(), c.id, true);
    expect((await service.balanceOf(streamer())) - hostBefore).toBe(usd(5));
    expect(await service.balanceOf(kai)).toBe(usd(3));
    expect(await ledger.ledger().balanceOf(service.causeWallet("Austin Pets Alive"))).toBe(usd(2));

    // The program paid each share itself: one SharePaid per share in the settle transaction.
    const chain = ledger.ledger() as unknown as { connection: Connection; program: { account: { splits: { fetch(a: unknown): Promise<{ shares: { pct: number }[] }> } } }; splitsAddress(a: unknown): unknown };
    const { PublicKey } = await import("@solana/web3.js");
    const settled = service.getChallenge(c.id);
    const record = await chain.program.account.splits.fetch(chain.splitsAddress(new PublicKey(settled.ledgerRef!.split(":")[0]!)));
    expect(record.shares.map((s) => s.pct)).toEqual([30, 20]);
    const tx = await chain.connection.getTransaction(settled.txs.settle!, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    const { decodeLogs } = await import("@potted/chain");
    const paid = decodeLogs(tx!.meta!.logMessages!, process.env.SOLANA_TEST_PROGRAM_ID!).filter((e) => e.name === "SharePaid");
    expect(paid.map((e) => Number(e.fields.amount))).toEqual([usd(3), usd(2)]);
    await service.updateSettings(streamer(), { ...service.settingsOf(streamer()), causeOn: false });
  }, 120_000);

  it("pays a cause's up-front share to the cause's own wallet, and refuses a payout that leaves shares out", async () => {
    const { PublicKey } = await import("@solana/web3.js");
    const causeWallet = Keypair.generate().publicKey.toBase58();
    await service.updateSettings(streamer(), { ...service.settingsOf(streamer()), causeOn: true, causeName: "Food Bank", causePct: 25, causeWallet });
    const dee = await service.signIn("Dee", "fan");
    const c = await service.createChallenge(streamer(), { ...clip("Win a race with no crashes at all"), upfrontPct: 40 });
    expect(c.splits).toEqual([expect.objectContaining({ kind: "cause", wallet: causeWallet, pct: 25 })]);
    await service.pledge(dee, c.id, 10);

    // Leaving the share's token account out is refused by the program itself.
    const chain = ledger.ledger() as unknown as {
      program: { methods: { lock(): { accountsPartial(a: object): { rpc(): Promise<string> } } } };
      accountsFor(c: unknown): { streamer: InstanceType<typeof PublicKey>; account: InstanceType<typeof PublicKey>; vault: InstanceType<typeof PublicKey> };
      splitsAddress(a: unknown): InstanceType<typeof PublicKey>;
      ensureTokenAccount(w: string): Promise<InstanceType<typeof PublicKey>>;
      server: Keypair;
    };
    const { streamer: host, account, vault } = chain.accountsFor(c);
    const streamerToken = await chain.ensureTokenAccount(host.toBase58());
    await expect(
      chain.program.methods.lock().accountsPartial({ authority: chain.server.publicKey, challenge: account, vault, streamerToken, splits: chain.splitsAddress(account) }).rpc(),
    ).rejects.toThrow(/MissingShareAccount|Pass a token account/);

    const before = await service.balanceOf(streamer());
    await service.lock(streamer(), c.id);
    // $4 up front: $1 to the cause's own wallet, $3 to the host.
    expect(await ledger.ledger().balanceOf(causeWallet)).toBe(usd(1));
    expect((await service.balanceOf(streamer())) - before).toBe(usd(3));
    await service.updateSettings(streamer(), { ...service.settingsOf(streamer()), causeOn: false, causeWallet: "" });
  }, 120_000);

  it("pays the up-front share on chain at start, and refunds only the rest on a miss", async () => {
    const lee = await service.signIn("Lee", "fan");
    const c = await service.createChallenge(service.getStreamer("kai")!, { ...clip("Beat the first boss without healing"), upfrontPct: 50 });
    const kai = service.getStreamer("kai")!;
    const kaiBefore = await service.balanceOf(kai);
    await service.pledge(lee, c.id, 4);
    await service.pledge(lee, c.id, 3);
    await service.lock(kai, c.id);
    expect((await service.balanceOf(kai)) - kaiBefore).toBe(3_500_000);
    await service.cancel(kai, c.id);
    // Lee pledged $7, $3.50 went up front, $3.50 came back in one refund.
    expect(await service.balanceOf(lee)).toBe(usd(25 - 3.5));
    expect(service.gardenOf(lee).returnedMicro).toBe(3_500_000);
  }, 120_000);

  it("sends a gift on chain and runs an open pot past the old per-fan limit", async () => {
    const { give } = await import("../src/lib/gifts");
    const amy = await service.signIn("Amy", "fan");
    const before = await service.balanceOf(streamer());
    await give(amy, "ryan", 3, "thanks!");
    expect(await service.balanceOf(amy)).toBe(usd(22));
    expect(await service.balanceOf(streamer())).toBe(before + usd(3));

    const open = await service.createChallenge(streamer(), { ...clip("Win a street race without hitting a wall"), goalUsd: 0, pledgeCapUsd: 0, open: true });
    await service.pledge(amy, open.id, 12);
    await service.pledge(amy, open.id, 6);
    expect(await service.balanceOf(amy)).toBe(usd(4));
    expect(service.getChallenge(open.id).totalMicro).toBe(usd(18));
  }, 90_000);

  it("holds request money on chain, pays it when the attempt starts, and returns it on a pass", async () => {
    const kim = await service.signIn("Kim", "fan");
    const before = await service.balanceOf(streamer());
    const post = (text: string) => service.postBounty(kim, { handle: "ryan", gameId: "gta6", text, amountUsd: 4, hours: 2 });
    const taken = await post("Pull off a heist without a getaway car");
    expect(await service.balanceOf(kim)).toBe(usd(21));
    const c = await service.acceptBounty(streamer(), taken.id, clip("Pull off a heist without a getaway car"));
    expect(c.requestMicro).toBe(usd(4));
    await service.lock(streamer(), c.id);
    expect(await service.balanceOf(streamer())).toBe(before + usd(4));
    // A miss refunds completion pledges; the request money was for taking it on.
    await service.simulateResult(streamer(), c.id, false);
    expect(await service.balanceOf(streamer())).toBe(before + usd(4));

    const passed = await post("Win a street race in a garbage truck");
    expect(await service.balanceOf(kim)).toBe(usd(17));
    await service.declineBounty(streamer(), passed.id);
    expect(await service.balanceOf(kim)).toBe(usd(21));
  }, 180_000);

  it("signs through Privy for a wallet Privy holds", async () => {
    // A stand-in for Privy's wallet API: it holds the keys and signs what it is sent.
    const http = await import("node:http");
    const { Transaction } = await import("@solana/web3.js");
    const held = new Map<string, Keypair>();
    const seen: string[] = [];
    const fake = http.createServer((req, res) => {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        seen.push(`${req.method} ${req.url} ${req.headers["privy-app-id"]}`);
        if (req.url === "/v1/wallets") {
          const key = Keypair.generate();
          const id = `wal_${held.size + 1}`;
          held.set(id, key);
          return res.end(JSON.stringify({ id, address: key.publicKey.toBase58(), chain_type: "solana" }));
        }
        const id = req.url!.split("/")[3]!;
        const tx = Transaction.from(Buffer.from(JSON.parse(body).params.transaction, "base64"));
        tx.partialSign(held.get(id)!);
        res.end(JSON.stringify({ method: "signTransaction", data: { signed_transaction: tx.serialize({ requireAllSignatures: false }).toString("base64"), encoding: "base64" } }));
      });
    });
    await new Promise<void>((done) => fake.listen(0, "127.0.0.1", done));
    const port = (fake.address() as { port: number }).port;
    Object.assign(process.env, { PRIVY_APP_ID: "app_test", PRIVY_APP_SECRET: "secret", PRIVY_API_BASE: `http://127.0.0.1:${port}` });
    try {
      const nia = await service.signInWith("email", { subject: "nia@example.com", name: "Nia", email: "nia@example.com" });
      expect([...held.values()].map((k) => k.publicKey.toBase58())).toContain(nia.wallet);
      await service.chooseRole(nia, "fan");
      expect(await service.balanceOf(nia)).toBe(usd(25));
      const c = await service.createChallenge(streamer(), clip("Win the next street race"));
      await service.pledge(nia, c.id, 4);
      expect(await service.balanceOf(nia)).toBe(usd(21));
      expect(seen.some((s) => s.startsWith("POST /v1/wallets/wal_") && s.endsWith("app_test"))).toBe(true);
    } finally {
      for (const k of ["PRIVY_APP_ID", "PRIVY_APP_SECRET", "PRIVY_API_BASE"]) delete process.env[k];
      fake.close();
    }
  }, 120_000);

  it("builds a Blink pledge that a wallet Potted does not hold can sign, tops it up on devnet, and books it once", async () => {
    const { SolanaLedger } = await import("../src/lib/solana-ledger");
    const chain = ledger.ledger() as unknown as InstanceType<typeof SolanaLedger>;
    const c = await service.createChallenge(streamer(), clip("Win the street race without crashing"));
    const wallet = Keypair.generate();
    const { transaction, toppedUpMicro } = await chain.pledgeTransactionFor(c, wallet.publicKey.toBase58(), usd(3));
    expect(toppedUpMicro).toBe(usd(3));
    const tx = Transaction.from(Buffer.from(transaction, "base64"));
    tx.partialSign(wallet);
    const signature = await chain.connection.sendRawTransaction(tx.serialize());
    await chain.connection.confirmTransaction(signature, "confirmed");

    const seen = await chain.pledgeIn(signature, c);
    expect(seen).toMatchObject({ wallet: wallet.publicKey.toBase58(), amountMicro: usd(3) });
    const booked = service.recordWalletPledge({ challengeAccount: service.chainAccountOf(c.ledgerRef!), signature, ...seen!, confirmedAt: Date.now(), streamAt: Date.now() });
    expect(booked).toBeDefined();
    expect(service.recordWalletPledge({ challengeAccount: service.chainAccountOf(c.ledgerRef!), signature, ...seen!, confirmedAt: Date.now() })).toBeUndefined();
    expect(service.getChallenge(c.id).totalMicro).toBe(usd(3));
    expect(await chain.pledgeIn(signature, await service.createChallenge(streamer(), clip("Another one entirely different")))).toBeUndefined();
  }, 60_000);

  it("backfills the on-chain record from past transactions, and the QuickNode filter decodes real blocks the same way", async () => {
    const { backfillChain } = await import("../src/lib/backfill");
    const { chainEvents } = await import("../src/lib/chain");
    const { escrowFilterSource, parseDelivery } = await import("@potted/chain");
    const connection = new Connection(RPC!, "confirmed");
    const programId = process.env.SOLANA_TEST_PROGRAM_ID!;
    const result = await backfillChain(connection, programId, 300);
    expect(result.stored).toBeGreaterThan(5);
    const names = new Set(chainEvents(500).map((e) => e.name));
    for (const n of ["ChallengeCreated", "Pledged", "Locked", "Settled", "SharePaid", "SplitsSet", "Refunded"]) expect(names).toContain(n);
    expect((await backfillChain(connection, programId, 300)).stored).toBe(0);

    // Run the filter on real blocks: the slots of a few events just backfilled.
    const run = new Function(`${escrowFilterSource(programId)}\nreturn main;`)() as (s: unknown) => unknown;
    const slots = [...new Set(chainEvents(500).filter((e) => e.name === "SharePaid" || e.name === "SplitsSet").map((e) => e.slot))].slice(0, 4);
    for (const slot of slots) {
      const block = await connection.getBlock(slot, { commitment: "confirmed", maxSupportedTransactionVersion: 0, transactionDetails: "full", rewards: false });
      const raw = JSON.parse(JSON.stringify({ ...block, slot }));
      const filtered = run({ data: [raw] });
      expect(parseDelivery(filtered, programId)).toEqual(parseDelivery([raw], programId));
      expect(parseDelivery(filtered, programId).length).toBeGreaterThan(0);
    }

    // The charity filter, on the real block where the program paid a cause's share.
    const { causeFilterSource } = await import("@potted/chain");
    const causeRun = new Function(`${causeFilterSource(process.env.USDC_MINT!, service.allCauseWallets())}\nreturn main;`)() as (s: unknown) => { data: { wallet: string; amount: number }[] } | null;
    const toCause = chainEvents(500).find((e) => e.name === "SharePaid" && service.allCauseWallets().includes(String(e.fields.wallet)))!;
    const block = await connection.getBlock(toCause.slot, { commitment: "confirmed", maxSupportedTransactionVersion: 0, transactionDetails: "full", rewards: false });
    const seen = causeRun({ data: [JSON.parse(JSON.stringify({ ...block, slot: toCause.slot }))] });
    expect(seen!.data).toContainEqual(expect.objectContaining({ wallet: String(toCause.fields.wallet), amount: Number(toCause.fields.amount) }));
  }, 120_000);

  it("puts a planter's earned badges in their wallet as soulbound tokens, once each", async () => {
    const spl = await import("@solana/spl-token");
    const { PublicKey } = await import("@solana/web3.js");
    const connection = new Connection(RPC!, "confirmed");
    const fan = await service.signIn("Badge Fan", "fan");
    const c = await service.createChallenge(streamer(), clip("Clear the heist on hard difficulty"));
    await service.pledge(fan, c.id, 2);
    expect(service.planterStats(fan).badges.filter((b) => b.earned).map((b) => b.id)).toEqual(expect.arrayContaining(["first-bean", "early-bird"]));

    const { minted } = await service.mintBadges(fan, "https://potted.example");
    expect(minted).toEqual(expect.arrayContaining(["first-bean", "early-bird"]));
    const record = service.badgeMintsOf(fan)["first-bean"]!;
    const mint = new PublicKey(record.mint);
    const info = await spl.getMint(connection, mint, "confirmed", spl.TOKEN_2022_PROGRAM_ID);
    expect(info.supply).toBe(1n);
    expect(info.decimals).toBe(0);
    expect(info.mintAuthority).toBeNull();
    expect(spl.getExtensionTypes(info.tlvData)).toEqual(expect.arrayContaining([spl.ExtensionType.NonTransferable, spl.ExtensionType.MetadataPointer]));
    const meta = await spl.getTokenMetadata(connection, mint, "confirmed", spl.TOKEN_2022_PROGRAM_ID);
    expect(meta).toMatchObject({ name: "Potted · First bean", symbol: "POTTED", uri: "https://potted.example/api/badges/first-bean", additionalMetadata: [["badge", "first-bean"]] });
    const owner = new PublicKey(fan.wallet);
    const held = spl.getAssociatedTokenAddressSync(mint, owner, false, spl.TOKEN_2022_PROGRAM_ID);
    expect((await spl.getAccount(connection, held, "confirmed", spl.TOKEN_2022_PROGRAM_ID)).amount).toBe(1n);

    // A second run mints nothing new.
    expect((await service.mintBadges(fan, "https://potted.example")).minted).toEqual([]);

    // Soulbound: the token program refuses to move it, even when its owner signs.
    const keys = JSON.parse(fs.readFileSync(path.join(process.env.POTTED_DATA_DIR!, "wallets.json"), "utf8")) as Record<string, number[]>;
    const ownerKey = Keypair.fromSecretKey(Uint8Array.from(keys[fan.wallet]!));
    const chain = ledger.ledger() as unknown as { server: Keypair };
    const other = Keypair.generate().publicKey;
    const otherAta = spl.getAssociatedTokenAddressSync(mint, other, false, spl.TOKEN_2022_PROGRAM_ID);
    const move = new Transaction().add(
      spl.createAssociatedTokenAccountIdempotentInstruction(chain.server.publicKey, otherAta, other, mint, spl.TOKEN_2022_PROGRAM_ID),
      spl.createTransferCheckedInstruction(held, mint, otherAta, owner, 1, 0, [], spl.TOKEN_2022_PROGRAM_ID),
    );
    const { sendAndConfirmTransaction } = await import("@solana/web3.js");
    const refused = await sendAndConfirmTransaction(connection, move, [chain.server, ownerKey]).then(() => "", (e: Error & { logs?: string[] }) => `${e.message} ${(e.logs ?? []).join(" ")}`);
    expect(refused).toMatch(/[Nn]on.?[Tt]ransferable|0x25/);
  }, 120_000);
});
