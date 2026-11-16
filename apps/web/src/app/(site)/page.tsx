import Link from "next/link";
import { ChallengeCard } from "@/components/ChallengeCard";
import { GameDirectory } from "@/components/GameDirectory";
import { Icon, type IconName } from "@/components/Icon";
import { Beanstalk } from "@/components/Beanstalk";
import { SignInCard } from "@/components/SignInCard";
import { getStreamer, listChallenges } from "@/lib/service";
import { currentUser } from "@/lib/session";

const STEPS = [
  ["Fund", "Fans add to a pot for a challenge the streamer agreed to. Funds sit in escrow, and the beanstalk climbs as the pot fills."],
  ["Play", "The streamer attempts it live before the deadline. Pledging closes the moment the attempt starts."],
  ["Settle", "Game data decides. A win pays the streamer. A miss returns every pledge. Each result keeps a receipt."],
] as const;

const GUARANTEES: [IconName, string, string][] = [
  ["lock", "Only the verifier can settle", "The streamer cannot withdraw early, and a challenge can be settled exactly once."],
  ["refund", "Refunds never depend on us", "If no result arrives by the cutoff, the escrow lets anyone trigger every refund."],
  ["receipt", "Every result has a receipt", "A game id or clip link is stored with the settlement, so funders can recheck it."],
  ["shield", "Arranged games do not count", "Friendly matches, direct challenges and early resignations are ignored."],
];

const GROWTH = [
  ["Bean", "Empty pot"],
  ["Sprout", "First pledge"],
  ["Vine", "A third of the way"],
  ["Beanstalk", "Two thirds"],
  ["Clouds", "Goal reached"],
] as const;

/** Sample rows for the hero preview. Labelled as an example on the page. */
const SAMPLE_PLEDGES = [
  ["Maya", "+$5.00"],
  ["Jay", "+$8.00"],
  ["Priya", "+$2.00"],
] as const;

export default async function Home() {
  const user = await currentUser();
  const demo = getStreamer("ryan");
  const live = demo ? listChallenges(demo.id).slice(0, 3) : [];
  return (
    <>
      <section className="hero">
        <div>
          <p className="badge">
            <Icon name="shield" size={15} /> Escrowed in USDC · settled on evidence
          </p>
          <h1>
            Donations give fans nothing to do. <span className="accent">A pot does.</span>
          </h1>
          <p className="lede">
            Fans fund a challenge without leaving the stream. The game&apos;s own data decides the result, and the money
            pays out or refunds itself.
          </p>
          <div className="row">
            <Link href="/s/ryan" className="btn btn-primary btn-lg">
              Open the demo stream <Icon name="arrow" size={16} />
            </Link>
            <a href="#how" className="btn btn-ghost btn-lg">
              How it works
            </a>
          </div>
          <ul className="trust">
            <li>
              <Icon name="check" size={15} /> Refunded if it fails
            </li>
            <li>
              <Icon name="check" size={15} /> Checked against game data
            </li>
            <li>
              <Icon name="check" size={15} /> A receipt for every payout
            </li>
          </ul>
        </div>

        <div className="preview card" aria-label="Example pot">
          <div className="preview-head">
            <span className="label">Example pot</span>
            <span className="pill pill-open">Open for pledges</span>
          </div>
          <div className="preview-main">
            <Beanstalk stage={3} size={84} />
            <div>
              <p className="preview-title">Win the next rated bullet game</p>
              <p className="preview-amount mono">$15.00</p>
              <p className="muted small">of $20.00 · 3 fans</p>
            </div>
          </div>
          <div className="bar">
            <span style={{ width: "75%" }} />
          </div>
          <ul className="ledger">
            {SAMPLE_PLEDGES.map(([name, amount]) => (
              <li key={name}>
                <span>{name}</span>
                <span className="mono up">{amount}</span>
              </li>
            ))}
          </ul>
          <p className="preview-foot">
            <Icon name="data" size={15} /> Result read from the public Lichess game record
          </p>
        </div>
      </section>

      <section id="how">
        <p className="eyebrow">How it works</p>
        <h2 className="section-title">Three steps, no trust required</h2>
        <div className="steps">
          {STEPS.map(([title, text], i) => (
            <div key={title} className="card step">
              <span className="step-no mono">0{i + 1}</span>
              <h3>{title}</h3>
              <p className="muted">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="eyebrow">The pot</p>
        <h2 className="section-title">Every pledge is a magic bean</h2>
        <div className="card growth">
          {GROWTH.map(([name, when], stage) => (
            <div key={name} className="growth-stage">
              <Beanstalk stage={stage} size={78} />
              <strong>{name}</strong>
              <span className="muted small">{when}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="eyebrow">Settlement rules</p>
        <h2 className="section-title">Built so nobody has to take our word for it</h2>
        <div className="guarantees">
          {GUARANTEES.map(([icon, title, text]) => (
            <div key={title} className="card guarantee">
              <span className="icon-chip">
                <Icon name={icon} />
              </span>
              <div>
                <h3>{title}</h3>
                <p className="muted">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="eyebrow">Games and streams</p>
        <h2 className="section-title">One escrow, any kind of stream</h2>
        <p className="lede">Games with public results are checked against the data. Everything else settles by clip, with a window for funders to dispute.</p>
        <GameDirectory />
      </section>

      {live.length > 0 && (
        <section>
          <p className="eyebrow">Live</p>
          <h2 className="section-title">On the demo stream</h2>
          <div className="list">
            {live.map((c) => (
              <ChallengeCard key={c.id} challenge={c} />
            ))}
          </div>
        </section>
      )}

      {!user && (
        <section id="try">
          <SignInCard />
        </section>
      )}
    </>
  );
}
