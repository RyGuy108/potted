import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cloneVoice, deleteVoice, soundEffect } from "../src/lib/elevenlabs";
import * as service from "../src/lib/service";
import { DEMO_STREAMER_ID, resetForTests } from "../src/lib/store";

const calls: { url: string; init: RequestInit }[] = [];
const fake = (reply: () => Response) => (async (url: string, init: RequestInit) => {
  calls.push({ url, init });
  return reply();
}) as unknown as typeof fetch;
const sample = (type = "audio/mpeg", size = 1000) => new File([new Uint8Array(size)], "me.mp3", { type });

beforeEach(() => {
  resetForTests();
  calls.length = 0;
  process.env.ELEVENLABS_API_KEY = "test-key";
  process.env.POTTED_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "potted-sfx-"));
});
afterEach(() => delete process.env.ELEVENLABS_API_KEY);

describe("the streamer's own voice", () => {
  it("clones from their recordings, needs consent, and can be deleted", async () => {
    const id = await cloneVoice("Ryan", [sample()], fake(() => Response.json({ voice_id: "v_ryan" })));
    expect(id).toBe("v_ryan");
    expect(calls[0]!.url).toBe("https://api.elevenlabs.io/v1/voices/add");
    expect((calls[0]!.init.body as FormData).getAll("files")).toHaveLength(1);

    const ryan = service.getUser(DEMO_STREAMER_ID)!;
    expect(() => service.setOwnVoice(ryan, id, false)).toThrow("Confirm");
    service.setOwnVoice(ryan, id, true);
    expect(service.settingsOf(ryan)).toMatchObject({ voice: "own", ownVoice: { id: "v_ryan" } });
    await expect(service.updateSettings(ryan, { ...service.settingsOf(ryan), language: "es" })).resolves.toMatchObject({ voice: "own", language: "es" });

    expect(service.clearOwnVoice(ryan)).toBe("v_ryan");
    expect(service.settingsOf(ryan)).toMatchObject({ voice: "george", ownVoice: null });
    await expect(service.updateSettings(ryan, { ...service.settingsOf(ryan), voice: "own" })).rejects.toThrow("Clone your voice");
    await deleteVoice("v_ryan", fake(() => new Response(null, { status: 404 })));
  });

  it("refuses files that are not audio, too many files, or no key", async () => {
    await expect(cloneVoice("Ryan", [sample("image/png")], fake(() => Response.json({})))).rejects.toThrow("not an audio file");
    await expect(cloneVoice("Ryan", [sample(), sample(), sample(), sample()], fake(() => Response.json({})))).rejects.toThrow("up to 3");
    await expect(cloneVoice("Ryan", [sample()], fake(() => Response.json({ detail: { message: "quota" } }, { status: 400 })))).rejects.toThrow("quota");
    delete process.env.ELEVENLABS_API_KEY;
    await expect(cloneVoice("Ryan", [sample()], fake(() => Response.json({})))).rejects.toThrow("ELEVENLABS_API_KEY");
  });
});

describe("milestone sound effects", () => {
  it("are made once and then served from disk", async () => {
    const mp3 = new Uint8Array([1, 2, 3]);
    const first = await soundEffect("goal", fake(() => new Response(mp3)));
    expect(new Uint8Array(first!)).toEqual(mp3);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ duration_seconds: 3 });
    expect(fs.existsSync(path.join(process.env.POTTED_DATA_DIR!, "sfx-goal.mp3"))).toBe(true);
    await soundEffect("goal", fake(() => new Response(mp3)));
    expect(calls).toHaveLength(1);
  });
});

describe("announcer language", () => {
  it("reads the line in the stream's language, translated by Grok, and says which words it spoke", async () => {
    const { GET } = await import("../src/app/api/tts/route");
    const ryan = service.getUser(DEMO_STREAMER_ID)!;
    await service.updateSettings(ryan, { ...service.settingsOf(ryan), language: "es" });
    service.announceStream("ryan", "recap", "Maya added $5. The pot is at $28.");
    const seq = service.latestSeq();
    const real = globalThis.fetch;
    process.env.XAI_API_KEY = "xai-test";
    delete process.env.ELEVENLABS_API_KEY;
    globalThis.fetch = (async () => Response.json({ choices: [{ message: { content: JSON.stringify({ text: "Maya añadió $5. El bote está en $28." }) } }] })) as unknown as typeof fetch;
    try {
      const res = await GET(new Request(`http://localhost/api/tts?seq=${seq}`));
      expect(res.status).toBe(204);
      expect(decodeURIComponent(res.headers.get("X-Spoken-Text")!)).toBe("Maya añadió $5. El bote está en $28.");
      expect(res.headers.get("X-Spoken-Lang")).toBe("es");
    } finally {
      globalThis.fetch = real;
      delete process.env.XAI_API_KEY;
    }
  });
});
