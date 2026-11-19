import { beforeEach, describe, expect, it } from "vitest";
import { checkCode, sendCode, showsCodes } from "@/lib/email-auth";
import { resetForTests } from "@/lib/store";

const dev = { fetch: (() => Promise.reject(new Error("no network"))) as unknown as typeof fetch, env: { NODE_ENV: "development" } };

describe("email sign-in", () => {
  beforeEach(() => resetForTests());

  it("shows the code on a dev server with no mail service, and it works once", async () => {
    const { shown } = await sendCode("Maya@Example.com ", dev);
    expect(shown).toMatch(/^\d{6}$/);
    expect(checkCode("maya@example.com", shown!)).toBe("maya@example.com");
    expect(() => checkCode("maya@example.com", shown!)).toThrow("expired");
  });

  it("allows five tries", async () => {
    const { shown } = await sendCode("a@b.co", dev);
    const wrong = shown === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect(() => checkCode("a@b.co", wrong)).toThrow("not right");
    expect(() => checkCode("a@b.co", shown!)).toThrow("Too many tries");
  });

  it("refuses to show codes in production, and mails them through Resend when set", async () => {
    expect(showsCodes({ NODE_ENV: "production" })).toBe(false);
    await expect(sendCode("a@b.co", { ...dev, env: { NODE_ENV: "production" } })).rejects.toThrow("not connected");
    let sent: Record<string, unknown> | undefined;
    const mail = { env: { NODE_ENV: "production", RESEND_API_KEY: "re_x" }, fetch: (async (_u: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return new Response("{}"); }) as typeof fetch };
    expect(await sendCode("c@d.co", mail)).toEqual({});
    expect(String(sent!.subject)).toMatch(/^\d{6} is your Potted sign-in code$/);
  });
});
