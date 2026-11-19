import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of service · Potted" };

/** Plain-language terms. Public, no sign-in needed. */
export default function Terms() {
  return (
    <article className="legal">
      <h1>Terms of service</h1>
      <p className="muted small">Last updated November 19, 2026</p>
      <p>By using Potted you agree to these terms. If you don&rsquo;t agree, please don&rsquo;t use it.</p>

      <h2>A prototype on devnet</h2>
      <p>
        Potted is a hackathon prototype. It runs on the Solana devnet with test tokens that have no value. Don&rsquo;t send real money or
        real assets to any address you see here. Features may change, break or be reset, and accounts and data may be wiped without notice.
      </p>

      <h2>Your account</h2>
      <p>
        Keep your sign-in secure and give accurate information. You are responsible for what you post and do on Potted. One person, one
        account for each role.
      </p>

      <h2>Challenges and conduct</h2>
      <p>
        Don&rsquo;t create or fund challenges that are illegal, dangerous, hateful, sexual, or that break the rules of the streaming platform
        involved. Streamers can decline any challenge. Moderators and we can remove challenges and accounts that break these rules. Results
        are settled on the evidence shown; decisions by reviewers are final within Potted.
      </p>

      <h2>No warranty</h2>
      <p>
        Potted is provided as is, with no warranty of any kind. To the extent the law allows, we are not liable for any loss arising from
        using it.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We may update these terms; the date above shows the latest version. Questions: open an issue at{" "}
        <a href="https://github.com/RyGuy108/potted/issues">github.com/RyGuy108/potted</a>.
      </p>
      <p>
        <Link href="/privacy">Privacy policy</Link>
      </p>
    </article>
  );
}
