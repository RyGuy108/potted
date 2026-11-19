import fs from "node:fs";
import path from "node:path";

/**
 * The ElevenLabs calls beyond reading a line: cloning a streamer's own
 * voice (only with their consent, and they can delete it), and the short
 * sound effects the overlay plays when a pot reaches half way or its goal.
 */

const API = "https://api.elevenlabs.io/v1";

export function elevenLabsKey(): string | undefined {
  return process.env.ELEVENLABS_API_KEY || undefined;
}

/** Up to three samples of a few MB each is plenty for an instant clone. */
export const MAX_SAMPLES = 3;
export const MAX_SAMPLE_BYTES = 10 * 1024 * 1024;

/** Makes an instant voice clone from the streamer's samples. Returns the new voice's id. */
export async function cloneVoice(name: string, samples: File[], doFetch: typeof fetch = fetch): Promise<string> {
  const key = elevenLabsKey();
  if (!key) throw new Error("Voice cloning needs ELEVENLABS_API_KEY. See docs/keys.md.");
  if (samples.length === 0) throw new Error("Add at least one recording of your voice");
  if (samples.length > MAX_SAMPLES) throw new Error(`Use up to ${MAX_SAMPLES} recordings`);
  for (const file of samples) {
    if (!file.type.startsWith("audio/")) throw new Error(`${file.name} is not an audio file`);
    if (file.size > MAX_SAMPLE_BYTES) throw new Error(`${file.name} is over 10 MB`);
  }
  const form = new FormData();
  form.set("name", `Potted announcer: ${name}`.slice(0, 60));
  form.set("description", "A streamer's own voice for their Potted overlay announcer, cloned with their consent.");
  form.set("remove_background_noise", "true");
  for (const file of samples) form.append("files", file, file.name);
  const res = await doFetch(`${API}/voices/add`, { method: "POST", headers: { "xi-api-key": key }, body: form });
  const body = (await res.json().catch(() => ({}))) as { voice_id?: string; detail?: { message?: string } | string };
  if (!res.ok || !body.voice_id) {
    const detail = typeof body.detail === "string" ? body.detail : body.detail?.message;
    throw new Error(`ElevenLabs could not clone the voice${detail ? `: ${detail}` : ""}`);
  }
  return body.voice_id;
}

/** Removes a cloned voice from ElevenLabs. A voice that is already gone counts as removed. */
export async function deleteVoice(voiceId: string, doFetch: typeof fetch = fetch): Promise<void> {
  const key = elevenLabsKey();
  if (!key) return;
  const res = await doFetch(`${API}/voices/${encodeURIComponent(voiceId)}`, { method: "DELETE", headers: { "xi-api-key": key } });
  if (!res.ok && res.status !== 404) throw new Error("ElevenLabs could not delete the voice. Try again.");
}

/** What each sound effect should sound like. Generated once, then kept on disk. */
export const SOUND_EFFECTS = {
  half: { prompt: "Short bright two-note marimba chime, cheerful game level-up ping, clean, no voice", seconds: 1.5 },
  goal: { prompt: "Triumphant short orchestral brass sting with a sparkling cymbal swell, game victory fanfare, no voice", seconds: 3 },
} as const;

export type SoundEffect = keyof typeof SOUND_EFFECTS;

const memory = new Map<SoundEffect, ArrayBuffer>();

function cacheFile(kind: SoundEffect): string {
  return path.join(process.env.POTTED_DATA_DIR || path.join(process.cwd(), ".data"), `sfx-${kind}.mp3`);
}

/** The sound effect as MP3, from memory, from disk, or made by ElevenLabs the first time. Undefined with no key. */
export async function soundEffect(kind: SoundEffect, doFetch: typeof fetch = fetch): Promise<ArrayBuffer | undefined> {
  const cached = memory.get(kind);
  if (cached) return cached;
  const file = cacheFile(kind);
  if (fs.existsSync(file)) {
    const bytes = fs.readFileSync(file);
    const audio = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    memory.set(kind, audio);
    return audio;
  }
  const key = elevenLabsKey();
  if (!key) return undefined;
  const { prompt, seconds } = SOUND_EFFECTS[kind];
  const res = await doFetch(`${API}/sound-generation?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text: prompt, duration_seconds: seconds, prompt_influence: 0.6 }),
  });
  if (!res.ok) return undefined;
  const audio = await res.arrayBuffer();
  memory.set(kind, audio);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(audio));
  return audio;
}
