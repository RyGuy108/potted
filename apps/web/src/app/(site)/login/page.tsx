import Link from "next/link";
import { redirect } from "next/navigation";
import { type DemoAccount, DemoAccounts } from "@/components/DemoAccounts";
import { EmailSignIn } from "@/components/EmailSignIn";
import { ProviderButtons } from "@/components/ProviderButtons";
import { SAMPLE_SIGN_INS } from "@/lib/sample-data";
import { ledger } from "@/lib/ledger";
import { getUser } from "@/lib/service";
import { TEST_ACCOUNTS } from "@/lib/test-accounts";
import { demoAccountsOn } from "@/lib/demo-mode";
import { currentUser } from "@/lib/session";
import { DEMO_GUEST_ID, DEMO_STREAMER_ID } from "@/lib/store";

const ERRORS: Record<string, string> = {
  "not-set-up": "That sign-in option is not connected on this server yet.",
  cancelled: "Sign-in was cancelled. Nothing was changed.",
  failed: "That sign-in did not go through. Please try again.",
};

const GROUP = { streamer: "Climbers", fan: "Planters", mod: "Keepers" } as const;
const HOME = { streamer: "/dashboard", fan: "/", mod: "/reviews" } as const;

/** For people who already have an account. New accounts start at /signup. */
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect("/");
  const { error } = await searchParams;
  // Make sure the test accounts exist before listing them.
  ledger();
  const demoOn = demoAccountsOn();
  const testing: DemoAccount[] = TEST_ACCOUNTS.filter((t) => getUser(t.id)).map((t) => ({ id: t.id, label: t.name, note: t.note, group: GROUP[t.role], home: HOME[t.role] }));
  const demo: DemoAccount[] = [
    { id: DEMO_STREAMER_ID, label: "Ryan", note: "Demo climber", group: GROUP.streamer, home: HOME.streamer },
    { id: DEMO_GUEST_ID, label: "Kai", note: "Demo climber, for collabs", group: GROUP.streamer, home: HOME.streamer },
    ...SAMPLE_SIGN_INS.filter((s) => getUser(s.id)).map((s) => ({ id: s.id, label: s.label, note: s.note, group: GROUP[s.role], home: HOME[s.role] })),
  ].filter((a) => demoOn && getUser(a.id));
  return (
    <div className="login-page">
      {error && ERRORS[error] && (
        <p className="error" role="alert">
          {ERRORS[error]}
        </p>
      )}
      <section className="card signin-panel">
        <div className="signin-pitch">
          <p className="eyebrow">Welcome back</p>
          <h2>Log in to Potted</h2>
          <p className="muted">Use the account you signed up with. You'll be asked which account to use.</p>
          <p className="muted small signin-links">
            New here? <Link href="/signup">Sign up</Link>
          </p>
        </div>
        <div className="signin-ways">
          <EmailSignIn />
          <ProviderButtons />
          {demoOn && testing.length > 0 && (
            <>
              <div className="divider">
                <span>or use a test account</span>
              </div>
              <DemoAccounts accounts={testing} />
            </>
          )}
          {demo.length > 0 && (
            <details className="more-accounts">
              <summary>More demo accounts (Ryan, Kai and the sample)</summary>
              <DemoAccounts accounts={demo} />
            </details>
          )}
        </div>
      </section>
    </div>
  );
}
