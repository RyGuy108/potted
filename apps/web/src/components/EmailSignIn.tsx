"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { emailCodeAction, emailVerifyAction } from "@/app/actions";

/** Sign in or sign up with an email address and a six-digit code. `as` is the sign-up page's account type. */
export function EmailSignIn({ as, verb = "Continue" }: { as?: "fan" | "streamer"; verb?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [shown, setShown] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const ask = () =>
    start(async () => {
      setError(undefined);
      const r = await emailCodeAction(email);
      if (!r.ok) return setError(r.error);
      setShown(r.shown);
      setStep("code");
    });

  const verify = () =>
    start(async () => {
      setError(undefined);
      const r = await emailVerifyAction(email, code, as);
      if (!r.ok) return setError(r.error);
      router.push(r.next);
      router.refresh();
    });

  return (
    <form
      className="email-signin"
      onSubmit={(e) => {
        e.preventDefault();
        if (step === "email") ask();
        else verify();
      }}
    >
      {step === "email" ? (
        <label>
          <span className="sr-only">Email</span>
          <input type="email" name="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      ) : (
        <>
          <p className="muted small">
            {shown ? (
              <>
                No mail service is connected, so here is the code for <strong>{email}</strong>: <strong className="mono">{shown}</strong>
              </>
            ) : (
              <>
                We sent a six-digit code to <strong>{email}</strong>.
              </>
            )}
          </p>
          <label>
            <span className="sr-only">Code</span>
            <input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={7} required autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
        </>
      )}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "One moment…" : step === "email" ? `${verb} with email` : "Sign in"}
      </button>
      {step === "code" && (
        <button type="button" className="linkish small" onClick={() => { setStep("email"); setCode(""); setShown(undefined); }}>
          Use a different email
        </button>
      )}
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
