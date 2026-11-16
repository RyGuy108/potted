import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { createMint, getAccount, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import { Escrow } from "../target/types/escrow";

const USDC = 1_000_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.escrow as Program<Escrow>;
  const payer = (provider.wallet as anchor.Wallet).payer;

  const streamer = Keypair.generate();
  const verifier = Keypair.generate();
  const fanA = Keypair.generate();
  const fanB = Keypair.generate();
  let mint: PublicKey;
  let nextId = 1;

  const tokenAccount = async (owner: PublicKey) =>
    (await getOrCreateAssociatedTokenAccount(provider.connection, payer, mint, owner)).address;
  const balance = async (owner: PublicKey) =>
    Number((await getAccount(provider.connection, await tokenAccount(owner))).amount);

  const pdas = (id: number) => {
    const [challenge] = PublicKey.findProgramAddressSync(
      [Buffer.from("challenge"), streamer.publicKey.toBuffer(), new BN(id).toArrayLike(Buffer, "le", 8)],
      program.programId,
    );
    const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), challenge.toBuffer()], program.programId);
    const pledge = (fan: PublicKey) =>
      PublicKey.findProgramAddressSync(
        [Buffer.from("pledge"), challenge.toBuffer(), fan.toBuffer()],
        program.programId,
      )[0];
    return { challenge, vault, pledge };
  };

  /** Opens a challenge. Times are seconds from now. */
  async function open(opts: { deadlineIn?: number; settleIn?: number; cap?: number } = {}) {
    const id = nextId++;
    const now = Math.floor(Date.now() / 1000);
    const deadline = now + (opts.deadlineIn ?? 600);
    const settleBy = now + (opts.settleIn ?? 1200);
    const p = pdas(id);
    await program.methods
      .createChallenge(new BN(id), 0, Array(32).fill(7), new BN(deadline), new BN(settleBy), new BN(opts.cap ?? 10 * USDC))
      .accountsPartial({
        payer: payer.publicKey,
        streamer: streamer.publicKey,
        verifier: verifier.publicKey,
        mint,
        challenge: p.challenge,
        vault: p.vault,
      })
      .signers([streamer])
      .rpc();
    return { id, ...p };
  }

  async function pledge(c: ReturnType<typeof pdas>, fan: Keypair, amount: number) {
    await program.methods
      .pledge(new BN(amount))
      .accountsPartial({
        payer: payer.publicKey,
        fan: fan.publicKey,
        challenge: c.challenge,
        pledge: c.pledge(fan.publicKey),
        fanToken: await tokenAccount(fan.publicKey),
        vault: c.vault,
      })
      .signers([fan])
      .rpc();
  }

  async function settle(c: ReturnType<typeof pdas>, success: boolean, signer = verifier) {
    await program.methods
      .settle(success, "lichess:abc12345", Array(32).fill(1))
      .accountsPartial({
        verifier: signer.publicKey,
        challenge: c.challenge,
        vault: c.vault,
        streamerToken: await tokenAccount(streamer.publicKey),
      })
      .signers([signer])
      .rpc();
  }

  async function refund(c: ReturnType<typeof pdas>, fan: PublicKey) {
    await program.methods
      .refund()
      .accountsPartial({
        challenge: c.challenge,
        pledge: c.pledge(fan),
        fanToken: await tokenAccount(fan),
        vault: c.vault,
      })
      .rpc();
  }

  async function expectError(run: Promise<unknown>, code: string) {
    try {
      await run;
    } catch (err) {
      assert.include(String(err), code);
      return;
    }
    assert.fail(`expected ${code}`);
  }

  before(async () => {
    mint = await createMint(provider.connection, payer, payer.publicKey, null, 6);
    for (const fan of [fanA, fanB]) {
      await mintTo(provider.connection, payer, mint, await tokenAccount(fan.publicKey), payer, 25 * USDC);
    }
    await tokenAccount(streamer.publicKey);
  });

  it("pays the whole pot to the streamer on a verified success", async () => {
    const c = await open();
    await pledge(c, fanA, 3 * USDC);
    await pledge(c, fanB, 2 * USDC);
    await pledge(c, fanA, 1 * USDC);

    const before = await balance(streamer.publicKey);
    await program.methods.lock().accountsPartial({ authority: streamer.publicKey, challenge: c.challenge }).signers([streamer]).rpc();
    await settle(c, true);

    assert.equal((await balance(streamer.publicKey)) - before, 6 * USDC);
    const state = await program.account.challenge.fetch(c.challenge);
    assert.deepEqual(state.status, { paid: {} });
    assert.equal(state.evidenceRef, "lichess:abc12345");
    assert.equal(state.totalPledged.toNumber(), 6 * USDC);
  });

  it("refunds every fan after a failed result, once each", async () => {
    const c = await open();
    const startA = await balance(fanA.publicKey);
    await pledge(c, fanA, 4 * USDC);
    await pledge(c, fanB, 2 * USDC);
    await settle(c, false);

    await refund(c, fanA.publicKey);
    await refund(c, fanB.publicKey);
    assert.equal(await balance(fanA.publicKey), startA);
    await expectError(refund(c, fanA.publicKey), "AlreadyRefunded");
  });

  it("lets only the verifier settle, and only once", async () => {
    const c = await open();
    await pledge(c, fanA, 1 * USDC);
    await expectError(settle(c, true, streamer), "Unauthorized");
    await settle(c, true);
    await expectError(settle(c, false), "AlreadySettled");
    await expectError(refund(c, fanA.publicKey), "NotRefundable");
  });

  it("enforces the per-fan cap and stops pledges after lock", async () => {
    const c = await open({ cap: 5 * USDC });
    await pledge(c, fanA, 4 * USDC);
    await expectError(pledge(c, fanA, 2 * USDC), "OverPledgeCap");
    await program.methods.lock().accountsPartial({ authority: verifier.publicKey, challenge: c.challenge }).signers([verifier]).rpc();
    await expectError(pledge(c, fanB, 1 * USDC), "NotOpen");
    await expectError(
      program.methods.lock().accountsPartial({ authority: fanA.publicKey, challenge: c.challenge }).signers([fanA]).rpc(),
      "Unauthorized",
    );
  });

  it("holds funds until a result or the timeout", async () => {
    const c = await open();
    await pledge(c, fanA, 1 * USDC);
    await expectError(refund(c, fanA.publicKey), "NotRefundable");
  });

  it("lets anyone refund after settle_by, and blocks a late settlement", async () => {
    const c = await open({ deadlineIn: 3, settleIn: 4 });
    const start = await balance(fanA.publicKey);
    await pledge(c, fanA, 2 * USDC);
    await sleep(7000);

    await expectError(settle(c, true), "SettleWindowClosed");
    await refund(c, fanA.publicKey);
    assert.equal(await balance(fanA.publicKey), start);
  });

  it("lets only the streamer cancel, which opens refunds and blocks a payout", async () => {
    const c = await open();
    const start = await balance(fanA.publicKey);
    await pledge(c, fanA, 2 * USDC);
    const cancel = (who: anchor.web3.Keypair) =>
      program.methods.cancel().accountsPartial({ streamer: who.publicKey, challenge: c.challenge }).signers([who]).rpc();

    await expectError(cancel(fanA), "Unauthorized");
    await cancel(streamer);
    await expectError(settle(c, true), "AlreadySettled");
    await expectError(cancel(streamer), "AlreadySettled");
    await refund(c, fanA.publicKey);
    assert.equal(await balance(fanA.publicKey), start);
  });

  it("rejects bad timing at creation", async () => {
    await expectError(open({ deadlineIn: -10 }), "DeadlineInPast");
    await expectError(open({ deadlineIn: 600, settleIn: 300 }), "BadSettleWindow");
  });
});
