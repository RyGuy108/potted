import * as service from "@/lib/service";
import { voiceId } from "@/lib/voices";

export const dynamic = "force-dynamic";

const cache = new Map<string, ArrayBuffer>();

/**
 * Announcer audio for one event. It takes an event number, not free text,
 * so nobody can use the endpoint to voice arbitrary words on our key.
 * Responds 204 when no key is set; the overlay then uses the browser voice.
 */
export async function GET(request: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return new Response(null, { status: 204 });

  const seq = Number(new URL(request.url).searchParams.get("seq"));
  const event = service.getEvent(seq);
  if (!event) return new Response(null, { status: 404 });

  // The streamer's chosen voice; ELEVENLABS_VOICE_ID overrides it with a custom one.
  const streamer = service.getStreamer(event.handle);
  const voice = process.env.ELEVENLABS_VOICE_ID || voiceId(streamer ? service.settingsOf(streamer).voice : "");
  const cacheKey = `${seq}:${voice}`;
  let audio = cache.get(cacheKey);
  if (!audio) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text: event.message, model_id: "eleven_flash_v2_5" }),
    });
    if (!res.ok) return new Response(null, { status: 204 });
    audio = await res.arrayBuffer();
    cache.set(cacheKey, audio);
    if (cache.size > 50) cache.delete(cache.keys().next().value!);
  }
  return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });
}
