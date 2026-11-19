import { DashHead, NotAClimber } from "@/components/DashHead";
import { CopyField } from "@/components/Live";
import { PointsPanel } from "@/components/PointsPanel";
import { SettingsForm } from "@/components/SettingsForm";
import { VoiceCard } from "@/components/VoiceCard";
import { ChatBotCard } from "@/components/ChatBotCard";
import { KickCard } from "@/components/KickCard";
import { botStatus } from "@/lib/chat-bot";
import { kickStatus, refreshKickLive } from "@/lib/kick";
import { elevenLabsKey } from "@/lib/elevenlabs";
import { CampaignPanel, PayoutsPanel } from "@/components/StreamerPanels";
import { pointsConfig, redemptionsFor } from "@/lib/points";
import { bountiesSupported, settingsOf } from "@/lib/service";
import { currentUser } from "@/lib/session";

/** The climber's Channel page: links, campaign, payouts, points and redemptions, settings. */
export default async function Channel({ searchParams }: { searchParams: Promise<{ bot?: string }> }) {
  const user = await currentUser();
  if (user?.role !== "streamer") return <NotAClimber user={user} />;
  const { bot } = await searchParams;
  // Kick's live status, read again when it is older than two minutes; a slow Kick shows "unknown", not "offline".
  await Promise.race([refreshKickLive(user), new Promise((r) => setTimeout(r, 2500))]);
  const now = Date.now();
  return (
    <>
      <DashHead user={user} label="Channel" title="Your channel" lede="Your links, campaign, payouts, channel point redemptions and rewards, and stream settings." />

      <div className="dash-stack">
        <section className="card links">
          <CopyField label="Fan page (put this in chat)" value={`/s/${user.handle}`} />
          <CopyField label="Overlay (OBS browser source)" value={`/overlay/${user.handle}`} />
          <p className="muted small">
            Add <code>?bg=1</code> to preview the overlay on a dark background, or <code>?muted=1</code> to silence the announcer.
          </p>
        </section>

        <div className="dash-pair">
          <CampaignPanel user={user} />
          <PayoutsPanel user={user} />
        </div>

        <PointsPanel config={pointsConfig(user.id)} redemptions={redemptionsFor(user.id)} />

        <div id="settings">
          <SettingsForm initial={settingsOf(user)} bounties={bountiesSupported()} />
        </div>

        <ChatBotCard status={botStatus(user)} />

        <KickCard status={kickStatus(user, now)} flash={bot} now={now} />

        <VoiceCard own={Boolean(settingsOf(user).ownVoice)} consentAt={settingsOf(user).ownVoice?.consentAt ?? null} ready={Boolean(elevenLabsKey())} />

      </div>
    </>
  );
}
