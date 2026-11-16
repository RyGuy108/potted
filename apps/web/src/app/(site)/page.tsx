import Link from "next/link";
import { ChallengeCard } from "@/components/ChallengeCard";
import { Plant } from "@/components/Plant";
import { SignInCard } from "@/components/SignInCard";
import { getStreamer, listChallenges } from "@/lib/service";
import { currentUser } from "@/lib/session";

const STEPS = [
  ["Fund it", "Fans chip in toward a challenge the streamer agreed to. The pot sits in escrow, and the plant grows as it fills."],
  ["Play it", "The streamer attempts it live before the deadline. Pledging closes when the attempt starts."],
  ["Settle it", "Game data decides. A win pays the streamer; a miss sends every pledge back. Each result keeps a receipt."],
] as const;

export default async function Home() {
  const user = await currentUser();
  const demo = getStreamer("ryan");
  const live = demo ? listChallenges(demo.id).slice(0, 3) : [];
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Fan-funded stream challenges</p>
          <h1>Donations give fans nothing to do. A pot does.</h1>
          <p className="lede">
            Fans fund a challenge without leaving the stream. The game&apos;s own data decides the result, and the money pays
            out or refunds itself, with proof anyone can check.
          </p>
          <div className="row">
            <Link href="/s/ryan" className="btn btn-primary">
              See the demo stream
            </Link>
            <a href="#how" className="btn btn-ghost">
              How it works
            </a>
          </div>
        </div>
        <div className="hero-plants" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((stage) => (
            <Plant key={stage} stage={stage} size={56 + stage * 10} />
          ))}
        </div>
      </section>

      <section id="how" className="steps">
        {STEPS.map(([title, text], i) => (
          <div key={title} className="card">
            <span className="step-no mono">0{i + 1}</span>
            <h3>{title}</h3>
            <p className="muted">{text}</p>
          </div>
        ))}
      </section>

      {live.length > 0 && (
        <section>
          <h2>On the demo stream</h2>
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
