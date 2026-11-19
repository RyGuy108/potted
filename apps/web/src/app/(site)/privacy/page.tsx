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

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account information.</strong> When you sign in with email, Google, Twitch or Discord, we store the provider&rsquo;s account
          id for you, your display name and your email address. We never see or store your password.
        </li>
        <li>
          <strong>Activity on Potted.</strong> Challenges you create, fund, back or review, tips, comments, notifications and your settings.
        </li>
        <li>
          <strong>Connected channels.</strong> If a streamer connects Kick or YouTube so the <code>!potted</code> chat bot can work, we store
          that channel&rsquo;s name and id and the access tokens, encrypted on our server.
        </li>
        <li>
          <strong>Wallets.</strong> Solana devnet wallet addresses linked to your account. Transactions on Solana are public by design.
        </li>
        <li>
          <strong>Technical data.</strong> A session cookie that keeps you signed in, and standard server logs (IP address, browser, time of
          request) kept for security and debugging.
        </li>
      </ul>

      <h2 id="google">Google user data</h2>
      <p>When you choose &ldquo;Continue with Google&rdquo;, Potted asks Google only for the <code>openid</code>, <code>email</code> and{" "}
        <code>profile</code> scopes. From your Google account we read:</p>
      <ul>
        <li>your Google account id (to recognise you next time you sign in),</li>
        <li>your first name or full name (shown as your display name), and</li>
        <li>your email address (to identify your account and send notices you ask for).</li>
      </ul>
      <p>
        Google also offers your profile picture with these scopes; Potted does not store it. We use the access token Google gives us once,
        to read the details above, and then discard it. We do not store Google tokens for sign-in, and we do not access your Gmail, contacts,
        Drive, calendar or any other Google data.
      </p>
      <p>
        If a streamer separately chooses &ldquo;Connect YouTube&rdquo;, Potted asks for YouTube access so the chat bot can read and reply in
        that streamer&rsquo;s live chat. Those tokens are encrypted on our server, used only for that chat, and deleted when the streamer
        disconnects.
      </p>
      <p>
        <strong>How we use it.</strong> Google user data is used only to sign you in, show your name on the site, and contact you about your
        account and challenges. We do not use it for advertising, we do not sell it, and we do not use it to train AI models.
      </p>
      <p>
        <strong>How we share it.</strong> We do not share Google user data with anyone, except the hosting and storage providers that run
        Potted for us (listed below), or when required by law.
      </p>
      <p>
        <strong>How we store and protect it.</strong> Account data is stored on our server at Railway and in our Supabase database, both
        over encrypted connections. Connected-channel tokens are additionally encrypted at rest. Access is limited to the people who run
        Potted.
      </p>
      <p>
        <strong>Retention and deletion.</strong> We keep your account data while your account exists. Ask us to delete your account (see
        Contact) and we delete your account, your Google id, name and email within 30 days, except records already written to the public
        blockchain, which cannot be erased. You can also revoke Potted&rsquo;s access at any time at{" "}
        <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.
      </p>
      <p>
        Potted&rsquo;s use of information received from Google APIs adheres to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the
        Limited Use requirements.
      </p>

      <h2>How we use information</h2>
      <p>
        Only to run Potted: signing you in, showing challenges and balances, settling challenges, sending notifications you asked for, keeping
        the service secure, and posting in a streamer&rsquo;s chat when they turned that on. We do not sell personal data or use it for
        advertising.
      </p>

      <h2>Who else sees it</h2>
      <p>
        Your display name and your activity on challenges are public on the site. Your email address is never shown publicly. These services
        process data for us, each only what it needs to do its job: Railway (hosting), Supabase (database), Google, Twitch, Discord and Kick
        (sign-in and chat), Privy (wallets), Resend (email delivery), ElevenLabs (voice announcements), xAI (challenge commentary, which
        sees challenge text, not your email) and QuickNode (Solana access).
      </p>

      <h2>Your choices</h2>
      <p>
        You can disconnect Kick or YouTube from your Channel page, and revoke Potted from your Google, Twitch,
        Discord or Kick account settings at any time. You can ask for a copy of your data or for its deletion through Contact below.
      </p>

      <h2>Children</h2>
      <p>Potted is not meant for anyone under 13, and we do not knowingly collect data from them.</p>

      <h2>Changes</h2>
      <p>If we change this policy, we update the date at the top of this page.</p>

      <h2>Contact</h2>
      <p>
        Questions, data requests or deletion requests: open an issue at{" "}
        <a href="https://github.com/RyGuy108/potted/issues">github.com/RyGuy108/potted/issues</a>. We answer within 7 days.
      </p>
      <p>
        <Link href="/terms">Terms of service</Link>
      </p>
    </article>
  );
}
