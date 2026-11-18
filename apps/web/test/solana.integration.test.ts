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

  it("refuses bounties, which are not on chain yet", async () => {
    const zoe = await service.signIn("Zoe", "fan");
    await expect(
      service.postBounty(zoe, { handle: "ryan", gameId: "gta6", text: "Finish the first heist clean", amountUsd: 5, hours: 24 }),
    ).rejects.toThrow("not on chain yet");
    expect(await service.balanceOf(zoe)).toBe(usd(25));
  }, 60_000);

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
});
