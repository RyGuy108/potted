import { SOUND_EFFECTS, type SoundEffect, soundEffect } from "@/lib/elevenlabs";

export const dynamic = "force-dynamic";

/**
 * The overlay's milestone sound effects, made by ElevenLabs once and then
 * served from disk. Only the fixed effects exist, so the endpoint cannot be
 * used to generate anything else. 204 with no key: the overlay plays a
 * built-in chime instead.
 */
export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind") as SoundEffect;
  if (!(kind in SOUND_EFFECTS)) return new Response(null, { status: 404 });
  const audio = await soundEffect(kind).catch(() => undefined);
  if (!audio) return new Response(null, { status: 204 });
  return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400" } });
}
