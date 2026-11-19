import { formatUsd } from "@potted/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShareButtons } from "@/components/ShareButtons";
import { pledgeCardFacts } from "@/lib/share-cards";
import { currentUser } from "@/lib/session";

type Props = { params: Promise<{ id: string; pledgeId: string }> };

function load(id: string, pledgeId: string) {
  const facts = pledgeCardFacts(pledgeId);
  return facts && facts.challenge.id === id ? facts : undefined;
}

/** The shared link unfurls as this pledge's card on X, Discord, iMessage and the rest. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, pledgeId } = await params;
  const facts = load(id, pledgeId);
  if (!facts) return {};
  const title = `${facts.planter?.name ?? "A planter"} planted ${formatUsd(facts.pledge.amountMicro)} on ${facts.streamer?.name ?? "a streamer"}'s challenge`;
  const description = `${facts.challenge.title}. It pays out only if they pull it off. Back it on Potted.`;
  const image = { url: `/api/cards/pledge/${pledgeId}`, width: 1200, height: 630, alt: title };
  return { title, description, openGraph: { title, description, images: [image] }, twitter: { card: "summary_large_image", title, description, images: [image.url] } };
}

export default async function PlantedPage({ params }: Props) {
  const { id, pledgeId } = await params;
  const facts = load(id, pledgeId);
  if (!facts) notFound();
  const { pledge, challenge, planter, streamer } = facts;
  const me = await currentUser();
  const mine = me?.id === pledge.userId;
  const open = challenge.status === "open";
  return (
    <section className="card planted">
      <p className="eyebrow">{mine ? "Your pledge" : `${planter?.name ?? "A planter"}'s pledge`}</p>
      <h1>
        {mine ? "You" : planter?.name ?? "A planter"} planted {formatUsd(pledge.amountMicro)} on {streamer?.name ?? "a streamer"}&apos;s challenge
      </h1>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="planted-card" src={`/api/cards/pledge/${pledge.id}?v=${challenge.totalMicro}-${challenge.status}`} alt="" width={1200} height={630} />
      {mine && (
        <>
          <p className="muted">Post it and your friends can back the same challenge. The card updates itself as the pot grows and when the result is in.</p>
          <ShareButtons
            path={`/c/${challenge.id}/planted/${pledge.id}`}
            text={open ? `I planted ${formatUsd(pledge.amountMicro)} on ${streamer?.name ?? "this"}'s challenge. It only pays if they pull it off. Back it with me:` : `I backed ${streamer?.name ?? "this"}'s challenge on Potted:`}
            card={`/api/cards/pledge/${pledge.id}`}
            cardName={`potted-${pledge.id}.png`}
          />
        </>
      )}
      <div className="row">
        <Link className={mine ? "btn btn-ghost" : "btn btn-primary"} href={open ? `/j/${streamer?.handle ?? ""}` : `/c/${challenge.id}`}>
          {open && !mine ? "Back it too" : "See the challenge"}
        </Link>
      </div>
    </section>
  );
}
