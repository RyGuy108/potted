/**
 * A small label naming the technology behind a moment on screen, so a
 * viewer (or a judge watching the demo) can see which part did what:
 * Grok drafted it, QuickNode Streams saw it on chain, ElevenLabs voiced
 * it, Solana holds and moves the money.
 */
export type Tech = "grok" | "quicknode" | "elevenlabs" | "solana";

export function TechTag({ tech, children, title }: { tech: Tech; children: React.ReactNode; title?: string }) {
  return (
    <span className={`tech-tag tech-${tech}`} title={title}>
      <span className="tech-dot" aria-hidden="true" />
      {children}
    </span>
  );
}
