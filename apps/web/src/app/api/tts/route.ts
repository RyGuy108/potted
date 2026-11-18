import { translateLine } from "@potted/coordinator";
import * as service from "@/lib/service";
import { currentUser } from "@/lib/session";
import type { StreamEvent } from "@/lib/store";
import { languageName, voiceId } from "@/lib/voices";

export const dynamic = "force-dynamic";

const cache = new Map<string, ArrayBuffer>();
const lines = new Map<string, string>();

/**
 * Announcer audio for one event. It takes an event number, not free text,
 * so nobody can use the endpoint to voice arbitrary words on our key.
 *
 * The line is read in the streamer's language (Grok translates it) and in
 * their chosen voice, which can be their own cloned voice. The spoken text
 * comes back in X-Spoken-Text so the overlay can show the same words.
 * Responds 204 when no ElevenLabs key is set; the overlay then uses the
 * browser voice with that text.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  // A signed-in streamer can hear one fixed sentence in their current voice and language.
  let event: Pick<StreamEvent, "seq" | "handle" | "message"> | undefined;
  if (params.get("preview")) {
    const me = await currentUser();
    if (me?.role !== "streamer" || !me.handle) return new Response(null, { status: 403 });
    event = { seq: -1, handle: me.handle, message: `Maya added $5.00. The pot is at $28.00. Thank you for backing ${me.name}!` };
  } else {
    event = service.getEvent(Number(params.get("seq")));
  }
  if (!event) return new Response(null, { status: 404 });
  const seq = event.seq;

  const streamer = service.getStreamer(event.handle);
  const settings = streamer ? service.settingsOf(streamer) : undefined;
  const language = settings?.language ?? "en";
  const lineKey = seq < 0 ? `preview:${event.handle}:${language}:${event.message}` : `${seq}:${language}`;
  let text = lines.get(lineKey);
  if (text === undefined) {
    text = language === "en" ? event.message : (await translateLine(event.message, languageName(language))).text;
    lines.set(lineKey, text);
    if (lines.size > 200) lines.delete(lines.keys().next().value!);
  }
  const spoken = { "X-Spoken-Text": encodeURIComponent(text), "X-Spoken-Lang": language, "Access-Control-Expose-Headers": "X-Spoken-Text, X-Spoken-Lang" };

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return new Response(null, { status: 204, headers: spoken });

  // The streamer's own cloned voice first, then a server-wide custom voice, then their stock pick.
  const voice =
    settings?.voice === "own" && settings.ownVoice ? settings.ownVoice.id : process.env.ELEVENLABS_VOICE_ID || voiceId(settings?.voice ?? "");
  const cacheKey = `${lineKey}:${voice}`;
  let audio = cache.get(cacheKey);
  if (!audio) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_flash_v2_5", ...(language !== "en" ? { language_code: language } : {}) }),
    });
    if (!res.ok) return new Response(null, { status: 204, headers: spoken });
    audio = await res.arrayBuffer();
    cache.set(cacheKey, audio);
    if (cache.size > 50) cache.delete(cache.keys().next().value!);
  }
  return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600", ...spoken } });
}
