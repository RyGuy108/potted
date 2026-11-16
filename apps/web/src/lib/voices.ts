/**
 * Announcer voices a streamer can pick. Ids are ElevenLabs stock voices;
 * without an ElevenLabs key the overlay uses the browser's voice instead.
 */
export const VOICES = [
  { key: "george", name: "George", note: "warm, British", elevenLabsId: "JBFqnCBsd6RMkjVDRZzb" },
  { key: "sarah", name: "Sarah", note: "bright, American", elevenLabsId: "EXAVITQu4vr4xnSDxMaL" },
  { key: "charlie", name: "Charlie", note: "casual, Australian", elevenLabsId: "IKne3meq5aSn9XLyUdCD" },
  { key: "brian", name: "Brian", note: "deep, American", elevenLabsId: "nPczCjzI2devNBz1zQrb" },
] as const;

export type VoiceKey = (typeof VOICES)[number]["key"];

export function voiceId(key: string): string {
  return (VOICES.find((v) => v.key === key) ?? VOICES[0]).elevenLabsId;
}
