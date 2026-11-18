import Link from "next/link";
import { ChallengeCard } from "@/components/ChallengeCard";
import { GameDirectory } from "@/components/GameDirectory";
import { Icon, type IconName } from "@/components/Icon";
import { Beanstalk } from "@/components/Beanstalk";
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

/** The explanation of Potted, shown to visitors who are not signed in and on /about. */
export async function Marketing() {
  const user = await currentUser();
  const demo = getStreamer("ryan");
  const live = demo ? listChallenges(demo.id).slice(0, 3) : [];
  return (
    <div className="marketing">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Fan-funded stream challenges · escrowed in USDC</p>
          <h1>Fans fund the challenge. The game decides who gets paid.</h1>
          <p className="lede">
            Viewers pledge to a challenge the streamer agreed to. The money waits in escrow, the game&apos;s own data or a disputable clip settles it, and
            a miss refunds every planter.
          </p>
          <div className="row hero-actions">
            {user ? (
              <Link href="/s/ryan" className="btn btn-primary btn-lg">
                Open the demo stream <Icon name="arrow" size={16} />
              </Link>
            ) : (
              <>
                <Link href="/signup" className="btn btn-primary btn-lg">
                  Sign up free <Icon name="arrow" size={16} />
                </Link>
                <Link href="/browse" className="btn btn-ghost btn-lg">
                  Browse live streams
                </Link>
              </>
            )}
          </div>
          <ul className="trust">
            <li>Refunded if it fails</li>
            <li>Checked against game data</li>
            <li>A receipt for every payout</li>
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

      <section id="how" className="split">
        <div>
          <p className="eyebrow">How it works</p>
          <h2 className="section-title">Three steps, and nobody has to trust anybody</h2>
        </div>
        <ol className="steps-list">
          {STEPS.map(([title, text], i) => (
            <li key={title}>
              <span className="step-no mono">0{i + 1}</span>
              <div>
                <h3>{title}</h3>
                <p className="muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <p className="eyebrow">The pot</p>
        <h2 className="section-title">The beanstalk climbs as the pot fills</h2>
        <div className="growth">
          {GROWTH.map(([name, when], stage) => (
            <div key={name} className="growth-stage">
              <Beanstalk stage={stage} size={78} />
              <strong>{name}</strong>
              <span className="muted small">{when}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="split">
        <div>
          <p className="eyebrow">Settlement rules</p>
          <h2 className="section-title">Built so nobody has to take our word for it</h2>
          <p className="muted">Each rule is enforced by the escrow program or the verifier, not by a person.</p>
        </div>
        <div className="accordion">
          {GUARANTEES.map(([, title, text], i) => (
            <details key={title} open={i === 0}>
              <summary>
                <span className="step-no mono">0{i + 1}</span>
                <span className="accordion-title">{title}</span>
                <span className="accordion-plus" aria-hidden="true" />
              </summary>
              <p className="muted">{text}</p>
            </details>
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
        <section id="try" className="closing">
          <h2 className="section-title">Back your first challenge</h2>
          <p className="muted">Sign up with an account you already have, or try it with test money first.</p>
          <div className="row">
            <Link href="/signup" className="btn btn-primary btn-lg">
              Sign up free <Icon name="arrow" size={16} />
            </Link>
            <Link href="/login" className="btn btn-ghost btn-lg">
              Log in
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
