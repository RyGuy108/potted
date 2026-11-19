import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy policy · Potted" };

/** Plain-language privacy policy. Public, no sign-in needed. */
export default function Privacy() {
  return (
    <article className="legal">
      <h1>Privacy policy</h1>
      <p className="muted small">Last updated November 19, 2026</p>
      <p>
        Potted is a prototype built for the University Blockchain Conference 2026 hackathon. It runs on the Solana devnet, so no real money
        moves through it. This page says what we keep about you and why.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your account.</strong> When you sign in with email, Google, Twitch or Discord, we keep the provider&rsquo;s id for you, your
          display name and your email address. We do not get or keep your password. The provider&rsquo;s sign-in token is used once to read
          your profile and then thrown away.
        </li>
        <li>
          <strong>What you do on Potted.</strong> Challenges you create, fund, back or review, tips, comments, and your settings.
        </li>
        <li>
          <strong>Connected channels.</strong> If a streamer connects Kick or YouTube so the <code>!potted</code> chat bot can work, we keep
          that channel&rsquo;s name and the access tokens, encrypted on our server. Disconnecting deletes them.
        </li>
        <li>
          <strong>Wallets.</strong> Devnet wallet addresses linked to your account. Transactions on Solana are public by design.
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>
        Only to run Potted: signing you in, showing your challenges and balances, sending notifications you asked for, and posting in a
        streamer&rsquo;s chat when they turned that on. We do not sell your data or use it for advertising.
      </p>

      <h2>Who else sees it</h2>
      <p>
        Your display name and your activity on challenges are public on the site. We use these services to run Potted, and each gets only
        what it needs: Railway (hosting), Google, Twitch, Discord and Kick (sign-in and chat), Privy (wallets), Supabase (storage), Resend
        (email), ElevenLabs (voice), xAI (commentary) and QuickNode (Solana access).
      </p>

      <h2>Deleting your data</h2>
      <p>
        Ask us to delete your account and we will remove it and what is linked to it, except records already written to the blockchain. You
        can also remove Potted&rsquo;s access from your Google, Twitch, Discord or Kick account settings at any time.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or deletion requests: open an issue at{" "}
        <a href="https://github.com/RyGuy108/potted/issues">github.com/RyGuy108/potted</a>.
      </p>
      <p>
        <Link href="/terms">Terms of service</Link>
      </p>
    </article>
  );
}
