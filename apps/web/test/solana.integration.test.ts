import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMint } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
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

  it("sends collab and charity shares from the host after the program pays out", async () => {
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
  }, 120_000);

  it("refuses bounties, which are not on chain yet", async () => {
    const zoe = await service.signIn("Zoe", "fan");
    await expect(
      service.postBounty(zoe, { handle: "ryan", gameId: "gta6", text: "Finish the first heist clean", amountUsd: 5, hours: 24 }),
    ).rejects.toThrow("not on chain yet");
    expect(await service.balanceOf(zoe)).toBe(usd(25));
  }, 60_000);
});
