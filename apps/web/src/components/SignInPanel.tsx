import Link from "next/link";
import { DemoSignUp } from "./DemoSignUp";
import { ProviderButtons } from "./ProviderButtons";

/**
 * The join prompt shown on pages a signed-out visitor lands on. It signs
 * people up as planters; climbers and keepers have their own sign-up pages.
 */
export function SignInPanel({ title = "Sign up to start planting", redirectTo }: { title?: string; /** Where to go after a demo sign-up. Stays on the page when omitted. */ redirectTo?: string }) {
  return (
    <section className="card signin-panel" id="signin">
      <div className="signin-pitch">
        <p className="eyebrow">Join in</p>
        <h2>{title}</h2>
        <ul className="signin-points">
          <li>No wallet, seed phrase or new password</li>
          <li>Missed challenges refund your pledge, less any up-front share shown before you pledge</li>
          <li>Earn levels and badges as your garden grows</li>
        </ul>
        <p className="muted small signin-links">
          Have an account? <Link href="/login">Log in</Link> · Run a stream? <Link href="/signup/climber">Sign up as a climber</Link>
        </p>
      </div>
      <div className="signin-ways">
        <ProviderButtons as="fan" />
        <div className="divider">
          <span>or try the demo with test money</span>
        </div>
        <DemoSignUp role="fan" redirectTo={redirectTo} />
      </div>
    </section>
  );
}
