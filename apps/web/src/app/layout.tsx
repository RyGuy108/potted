import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Potted · fan-funded stream challenges",
  description: "Fans fund a challenge, game data decides the result, and the pot pays out or refunds itself.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
