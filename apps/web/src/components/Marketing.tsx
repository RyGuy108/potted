import Link from "next/link";
import { ChallengeCard } from "@/components/ChallengeCard";
import { GameDirectory } from "@/components/GameDirectory";
import { Icon, type IconName } from "@/components/Icon";
import { Beanstalk } from "@/components/Beanstalk";
import { getStreamer, listChallenges } from "@/lib/service";
import { currentUser } from "@/lib/session";

const STEPS = [
  ["Ask", "A fan suggests the challenge they want to see, and can put money behind the request. Others in chat add to it."],
  ["Answer", "The streamer takes it on and sets the exact terms, or passes. If they pass, every fan gets their money back."],
  ["Back", "Anyone can back the attempt. That money only pays if the streamer actually pulls it off."],
  ["Play it live", "Request money goes to the streamer when they start. The game's data or a clip decides the rest, and a miss refunds every backer."],
] as const;

/** The three kinds of money, and exactly when each one pays. */
const WAYS: [string, string, string, string][] = [
  ["Fund a request", "Ask for something specific and put money on it.", "Paid when the streamer takes it on and starts", "Refunded if they pass or never start"],
  ["Back a challenge", "Add to the pot for a challenge that's open.", "Paid only if they complete it", "Refunded if they miss"],
  ["Tip", "Support the streamer directly, no challenge attached.", "Paid straight away", "Not refundable"],
];

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
          <p className="eyebrow">Stream challenges, chosen by chat</p>
          <h1>Donations give fans nothing to do. Potted gives them a say.</h1>
          <p className="lede">
            Fans ask for the challenge they want to see and put money behind it. The streamer takes it on or passes, and a pass sends the money back.
            Every dollar turns into a moment on stream that chat helped make.
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
            <li>Chat picks the challenge</li>
            <li>A pass is refunded</li>
            <li>Back it only if they finish</li>
          </ul>
        </div>

        <div className="preview card chat-preview" aria-label="Example: a request from chat">
          <div className="preview-head">
            <span className="label">Example from chat</span>
            <span className="pill pill-open">Live</span>
          </div>
          <ol className="chat-flow">
            <li className="chat-msg">
              <span className="chat-avatar" aria-hidden="true">
                M
              </span>
              <div>
                <p>
                  <strong>maya</strong> beat the next boss without taking a hit
                </p>
                <span className="chat-tag">Request · $12 from 4 fans</span>
              </div>
            </li>
            <li className="chat-msg streamer">
              <span className="chat-avatar" aria-hidden="true">
                R
              </span>
              <div>
                <p>
                  <strong>Ryan</strong> took it on: no-hit run, 30 minutes
                </p>
                <span className="chat-tag green">$12 is his once he starts</span>
              </div>
            </li>
          </ol>
          <div className="preview-main">
            <Beanstalk stage={3} size={72} />
            <div>
              <p className="preview-title">Backed if he pulls it off</p>
              <p className="preview-amount mono">$28.00</p>
              <p className="muted small">of $40.00 · 9 backers · refunded if he misses</p>
            </div>
          </div>
          <div className="bar">
            <span style={{ width: "70%" }} />
          </div>
          <ul className="ledger">
            {SAMPLE_PLEDGES.map(([name, amount]) => (
              <li key={name}>
                <span>{name}</span>
                <span className="mono up">{amount}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="how" className="split">
        <div>
          <p className="eyebrow">How it works</p>
          <h2 className="section-title">From a message in chat to a moment on stream</h2>
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
        <p className="eyebrow">Three ways to take part</p>
        <h2 className="section-title">Every kind of support says when it pays</h2>
        <div className="ways">
          {WAYS.map(([title, what, pays, back]) => (
            <article key={title} className="card way">
              <h3>{title}</h3>
              <p className="muted">{what}</p>
              <dl>
                <div>
                  <dt>Pays</dt>
                  <dd>{pays}</dd>
                </div>
                <div>
                  <dt>Otherwise</dt>
                  <dd>{back}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
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
        <h2 className="section-title">Any kind of stream</h2>
        <p className="lede">Games with public results are checked against the data. Everything else settles by clip, with a window for fans to dispute.</p>
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
          <h2 className="section-title">Ask for your first challenge</h2>
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
