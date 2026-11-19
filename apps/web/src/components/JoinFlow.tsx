"use client";

import { formatUsd } from "@potted/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { emailCodeAction, joinVerifyAction, pledgeAction } from "@/app/actions";
import { Beanstalk } from "./Beanstalk";

interface Props {
  handle: string;
  streamerName: string;
  challenge: { id: string; title: string; totalMicro: number; goalMicro: number; planters: number; stage: number };
  me: { name: string; role: string; balanceMicro: number; /** Already among this challenge's planters. */ backed: boolean } | null;
}

const AMOUNTS = [2, 5, 10];

type Step = "pick" | "email" | "code" | "done";

/** Pick an amount, sign in if needed, pledge, then hear your name. Everything on one card. */
export function JoinFlow({ handle, streamerName, challenge, me }: Props) {
  const router = useRouter();
  const [amount, setAmount] = useState(5);
  const [step, setStep] = useState<Step>("pick");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [shownCode, setShownCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [spoken, setSpoken] = useState(me?.name ?? "");
  // The figures as the page opened; the refresh after pledging brings new ones, which would count this pledge twice.
  const [start0] = useState(challenge);

  const pledge = async () => {
    const result = await pledgeAction(challenge.id, amount);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStep("done");
    router.refresh();
  };

  const back = () =>
    start(async () => {
      setError(null);
      if (!me) {
        setStep("email");
        return;
      }
      if (me.role !== "fan") {
        setError("Sign in with a planter account to back challenges.");
        return;
      }
      await pledge();
    });

  const pot = start0.totalMicro + (step === "done" ? amount * 1_000_000 : 0);
  const goal = challenge.goalMicro > 0 ? ` of ${formatUsd(challenge.goalMicro)}` : "";

  return (
    <section className="join-card" data-step={step}>
      <p className="eyebrow">Back {streamerName}</p>
      <h1>{challenge.title}</h1>
      <p className="join-pot">
        <span className="mono">{formatUsd(pot)}</span>
        {goal} · {start0.planters + (step === "done" && !me?.backed ? 1 : 0)} planters
      </p>
      <p className="muted small">Your money waits in escrow. It pays only if they pull it off, and comes back if they miss.</p>

      {step === "pick" && (
        <>
          <div className="join-amounts" role="radiogroup" aria-label="Amount">
            {AMOUNTS.map((a) => (
              <button key={a} type="button" role="radio" aria-checked={amount === a} className={amount === a ? "on" : ""} onClick={() => setAmount(a)}>
                ${a}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary join-go" disabled={pending} onClick={back}>
            {pending ? "Backing…" : `Back it with $${amount}`}
          </button>
          {me && <span className="muted small">As {me.name} · {formatUsd(me.balanceMicro)} in your wallet</span>}
        </>
      )}

      {step === "email" && (
        <form
          className="join-form"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setError(null);
              const result = await emailCodeAction(email);
              if (!result.ok) return setError(result.error);
              setShownCode(result.shown ?? null);
              setStep("code");
            });
          }}
        >
          <label className="field">
            <span>Your name, as the stream will read it</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} required autoFocus />
          </label>
          <label className="field">
            <span>Email, for a sign-in code</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <button className="btn btn-primary join-go" disabled={pending}>
            {pending ? "Sending…" : "Send my code"}
          </button>
          <span className="muted small">New here? You start with $25 of test USDC.</span>
        </form>
      )}

      {step === "code" && (
        <form
          className="join-form"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setError(null);
              const result = await joinVerifyAction(email, code, name);
              if (!result.ok) return setError(result.error);
              setSpoken(result.name);
              await pledge();
            });
          }}
        >
          <label className="field">
            <span>The 6-digit code we sent to {email}</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} required autoFocus />
          </label>
          {shownCode && <span className="muted small">Demo server: your code is {shownCode}</span>}
          <button className="btn btn-primary join-go" disabled={pending}>
            {pending ? "Backing…" : `Sign in and back it with $${amount}`}
          </button>
        </form>
      )}

      {step === "done" && (
        <div className="join-done" role="status">
          <div className="join-grow" aria-hidden="true">
            <Beanstalk stage={Math.min(4, challenge.stage + 1)} size={120} />
          </div>
          <h2>You&apos;re in the pot!</h2>
          <p>
            Listen to the stream: the announcer is about to say <strong>&ldquo;{spoken || "you"} added {formatUsd(amount * 1_000_000)}&rdquo;</strong>.
          </p>
          <p className="muted small">If {streamerName} misses, your {formatUsd(amount * 1_000_000)} comes back on its own.</p>
          <div className="join-next">
            <Link className="btn btn-primary" href="/garden">
              See your garden grow
            </Link>
            <Link className="btn btn-ghost" href={`/s/${handle}`}>
              More from {streamerName}
            </Link>
          </div>
        </div>
      )}

      {error && <p className="error small">{error}</p>}
    </section>
  );
}
