import { PROVIDERS, PROVIDER_IDS, isConfigured } from "@/lib/oauth";
import { DemoSignIn } from "./DemoSignIn";

/**
 * The one way in, used everywhere a visitor can sign in: an account they
 * already have, or the demo with test money.
 */
export function SignInPanel({ title = "Sign in to start planting", redirectTo }: { title?: string; /** Where to go after a demo sign-in. Stays on the page when omitted. */ redirectTo?: string }) {
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
      </div>
      <div className="signin-ways">
        <div className="providers">
          {PROVIDER_IDS.map((id) =>
            isConfigured(id) ? (
              <a key={id} className={`btn provider provider-${id}`} href={`/api/auth/${id}/start`}>
                Continue with {PROVIDERS[id].label}
              </a>
            ) : (
              <span key={id} className={`btn provider provider-${id} provider-off`} aria-disabled="true" title="Not connected on this server">
                Continue with {PROVIDERS[id].label}
                <span className="tag tag-quiet">not connected</span>
              </span>
            ),
          )}
        </div>
        <div className="divider">
          <span>or try the demo with test money</span>
        </div>
        <DemoSignIn redirectTo={redirectTo} />
      </div>
    </section>
  );
}
