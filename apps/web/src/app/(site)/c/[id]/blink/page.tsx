import type { Challenge } from "@potted/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { CopyField } from "@/components/Live";
import { TechTag } from "@/components/TechTag";
import { actionCard, actionUrl, blinkAmounts, solanaPayUrl } from "@/lib/blinks";
import * as service from "@/lib/service";
import { publicBase } from "@/lib/url";

export const dynamic = "force-dynamic";

/**
 * The Blink for a challenge, shown here rather than in an outside viewer:
 * the same card X and wallets read from the Action endpoint, and a QR code
 * per amount that a phone wallet (Phantom, Solflare) scans to sign the
 * pledge with its own keys. The pledge lands in the escrow program like
 * any other.
 */
export default async function BlinkPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ amount?: string }> }) {
  const { id } = await params;
  let challenge: Challenge;
  try {
    challenge = service.getChallenge(id);
  } catch {
    notFound();
  }
  const base = await publicBase();
  const card = actionCard(challenge, base);
  const streamer = service.getUser(challenge.streamerId);
  const amounts = blinkAmounts(streamer ? service.settingsOf(streamer).minPledgeUsd : 1);
  const asked = Number((await searchParams).amount);
  const amount = amounts.includes(asked) ? asked : (amounts[1] ?? amounts[0] ?? 5);
  const pay = solanaPayUrl(base, challenge.id, amount);
  const qr = await QRCode.toString(pay, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const disabled = "disabled" in card && card.disabled;

  return (
    <>
      <p className="crumbs small">
        <Link href={`/c/${challenge.id}`}>← Back to the challenge</Link>
      </p>
      <section className="card blink-card">
        <div className="blink-art">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.icon} alt="" width={240} height={240} />
        </div>
        <div className="blink-body">
          <div className="meta">
            <TechTag tech="solana">Solana Action · Blink</TechTag>
          </div>
          <h1>{card.title}</h1>
          <p className="muted">{card.description}</p>
          {disabled ? (
            <p className="warn">{"error" in card ? card.error?.message : "Pledging is closed."}</p>
          ) : (
            <>
              <div className="row wrap blink-amounts">
                {amounts.map((a) => (
                  <Link key={a} href={`?amount=${a}`} className={`btn ${a === amount ? "btn-primary" : "btn-ghost"}`} scroll={false}>
                    Pledge ${a}
                  </Link>
                ))}
              </div>
              <div className="blink-pay">
                <div className="blink-qr" dangerouslySetInnerHTML={{ __html: qr }} />
                <div>
                  <p>
                    <strong>Scan with Phantom or Solflare</strong> to pledge ${amount} from your own wallet.
                  </p>
                  <p className="muted small">
                    Your wallet asks Potted for the transaction, shows you what it does, and you sign it. The ${amount} waits in the escrow program and comes back if the challenge is missed. Set the wallet to devnet; it gets test USDC in the same transaction if it has none.
                  </p>
                  <a className="btn btn-ghost" href={pay}>
                    Open in a wallet on this device
                  </a>
                </div>
              </div>
            </>
          )}
          <CopyField label="Action link" value={actionUrl(base, challenge.id)} />
        </div>
      </section>
    </>
  );
}
