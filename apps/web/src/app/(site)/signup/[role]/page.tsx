import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DemoSignUp } from "@/components/DemoSignUp";
import { EmailSignIn } from "@/components/EmailSignIn";
import { ProviderButtons } from "@/components/ProviderButtons";
import { demoAccountsOn } from "@/lib/demo-mode";
import { currentUser } from "@/lib/session";
import { SIGNUP } from "../roles";

const HOME = { fan: "/", streamer: "/dashboard", mod: "/reviews" } as const;

/** Sign-up for one kind of account. */
export default async function SignUpAs({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  const page = SIGNUP.find((r) => r.path === role);
  if (!page) notFound();
  if (await currentUser()) redirect("/");
  // The name-only sign-up is for the demo only. Real keepers sign up like everyone else, then enter an invite code.
  const demo = demoAccountsOn();
  return (
    <div className="login-page">
      <section className="card signin-panel">
        <div className="signin-pitch">
          <p className="eyebrow">
            <Link href="/signup">Sign up</Link> · {page.label}
          </p>
          <h2>{page.title}</h2>
          <ul className="signin-points">
            {page.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <p className="muted small signin-links">
            Not a {page.label.toLowerCase()}? <Link href="/signup">Pick another account type</Link> · Have an account? <Link href="/login">Log in</Link>
          </p>
        </div>
        <div className="signin-ways">
          {page.role === "mod" && <p className="muted small">Keepers settle disputed clips, so you need an invite code from the Potted team. You'll enter it after signing in.</p>}
          <EmailSignIn as={page.role} verb="Sign up" />
          <ProviderButtons as={page.role} verb="Sign up" />
          {demo && (
            <div className="divider">
              <span>or try the demo with test money</span>
            </div>
          )}
          {demo && <DemoSignUp role={page.role} redirectTo={HOME[page.role]} />}
        </div>
      </section>
    </div>
  );
}
