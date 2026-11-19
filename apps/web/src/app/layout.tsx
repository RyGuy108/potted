import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { publicBase } from "@/lib/url";

/**
 * Read per request, so share previews (challenge, pledge and streamer
 * cards) carry the site's real address on any host, not localhost.
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(await publicBase()),
    title: "Potted · fan-funded stream challenges",
    description: "Fans fund a challenge, game data decides the result, and the pot pays out or refunds itself.",
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
