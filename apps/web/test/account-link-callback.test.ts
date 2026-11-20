import { beforeEach, expect, it, vi } from "vitest";
vi.mock("next/headers",()=>({cookies:vi.fn()}));
vi.mock("../src/lib/session",()=>({currentUser:vi.fn(),startSession:vi.fn()}));
vi.mock("../src/lib/service",()=>({chooseRole:vi.fn(),signInWith:vi.fn()}));
vi.mock("../src/lib/account",()=>({EmailLinkRequired:class extends Error {},linkIdentity:vi.fn()}));
vi.mock("../src/lib/account-sync",()=>({syncTwitchAccount:vi.fn()}));
vi.mock("../src/lib/url",()=>({publicBase:async()=>"https://potted.example"}));
vi.mock("../src/lib/oauth",()=>({isProvider:(p:string)=>p==="twitch",fetchProfile:vi.fn()}));
import { cookies } from "next/headers";
import { currentUser, startSession } from "../src/lib/session";
import { fetchProfile } from "../src/lib/oauth";
import { linkIdentity } from "../src/lib/account";
import { syncTwitchAccount } from "../src/lib/account-sync";
import { GET } from "../src/app/api/auth/[provider]/callback/route";
import type { User } from "../src/lib/store";
const user={id:"owner",name:"Creator",role:"streamer"} as User;
beforeEach(()=>{
  vi.clearAllMocks();
  vi.mocked(cookies).mockResolvedValue({get:()=>({value:"twitch:nonce:link:owner"}),delete:vi.fn()} as unknown as Awaited<ReturnType<typeof cookies>>);
  vi.mocked(currentUser).mockResolvedValue(user);
  vi.mocked(fetchProfile).mockResolvedValue({subject:"123",name:"Twitch Creator"});
  vi.mocked(syncTwitchAccount).mockResolvedValue(undefined);
});
const callback=(state="nonce")=>GET(new Request(`https://potted.example/api/auth/twitch/callback?code=code&state=${state}`),{params:Promise.resolve({provider:"twitch"})});
it("rejects mismatched OAuth state before exchanging a code",async()=>{
  const res=await callback("wrong");expect(res.headers.get("location")).toContain("settings?error=connection");expect(fetchProfile).not.toHaveBeenCalled();
});
it("rejects a callback after the signed-in Potted user changes",async()=>{
  vi.mocked(currentUser).mockResolvedValue({...user,id:"someone-else"});
  const res=await callback();expect(res.headers.get("location")).toContain("connection-session");expect(fetchProfile).not.toHaveBeenCalled();expect(linkIdentity).not.toHaveBeenCalled();
});
it("links into the current account without replacing its session",async()=>{
  const res=await callback();expect(linkIdentity).toHaveBeenCalledWith(user,"twitch",{subject:"123",name:"Twitch Creator"});expect(startSession).not.toHaveBeenCalled();expect(res.headers.get("location")).toContain("settings?connected=twitch");
});
it("keeps a successful link when schedule refresh fails and reports it as pending",async()=>{
  vi.mocked(syncTwitchAccount).mockRejectedValue(new Error("Unavailable"));
  expect((await callback()).headers.get("location")).toContain("sync=pending");expect(linkIdentity).toHaveBeenCalled();
});

it("connects Twitch to an existing planter without starting a session or importing broadcasts", async () => {
  const planter = { ...user, role: "fan" as const };
  vi.mocked(currentUser).mockResolvedValue(planter);
  const response = await callback();
  expect(response.headers.get("location")).toContain("settings?connected=twitch");
  expect(linkIdentity).toHaveBeenCalledWith(planter, "twitch", { subject: "123", name: "Twitch Creator" });
  expect(syncTwitchAccount).not.toHaveBeenCalled();
  expect(startSession).not.toHaveBeenCalled();
});
