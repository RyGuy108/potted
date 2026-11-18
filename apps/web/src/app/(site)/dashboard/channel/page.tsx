import { DashHead, NotAClimber } from "@/components/DashHead";
import { PastTile } from "@/components/PastTile";
import { CopyField } from "@/components/Live";
import { PointsPanel } from "@/components/PointsPanel";
import { SettingsForm } from "@/components/SettingsForm";
import { CampaignPanel, PayoutsPanel } from "@/components/StreamerPanels";
import { pointsConfig, redemptionsFor } from "@/lib/points";
import { bountiesSupported, listChallenges, settingsOf } from "@/lib/service";
import { currentUser } from "@/lib/session";

/** The climber's channel: links, campaign, money, rewards, settings and history. Set up before a stream, checked after. */
export default async function Channel() {
  const user = await currentUser();
  if (user?.role !== "streamer") return <NotAClimber user={user} />;
  const past = listChallenges(user.id).filter((c) => c.status === "paid" || c.status === "failed");
  return (
    <>
      <DashHead user={user} tab="channel" title="Your channel" lede="Set up before you go live, and check back after: your links, campaign, payouts, rewards and settings." />

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

        <PointsPanel config={pointsConfig(user.id)} redemptions={redemptionsFor(user.id)} mode="setup" />

        <div id="settings">
          <SettingsForm initial={settingsOf(user)} bounties={bountiesSupported()} />
        </div>

        <section id="history">
      {past.length === 0 ? (
        <>
          <h2>Previous challenges</h2>
          <p className="empty">Nothing settled yet. Finished challenges collect here, ready to run again.</p>
        </>
      ) : (
        <>
          <h2>Previous challenges</h2>
          <div className="past-grid">
            {past.map((c) => (
              <PastTile key={c.id} challenge={c} userId={user.id} />
            ))}
          </div>
        </>
      )}
        </section>
      </div>
    </>
  );
}
