import { PROVIDERS, PROVIDER_IDS, isConfigured } from "@/lib/oauth";

/** Google, Twitch and Discord. `as` carries the sign-up page's account type through the provider's round trip. */
export function ProviderButtons({ as, verb = "Continue" }: { as?: "fan" | "streamer"; verb?: string }) {
  return (
    <div className="providers">
      {PROVIDER_IDS.map((id) =>
        isConfigured(id) ? (
          <a key={id} className={`btn provider provider-${id}`} href={`/api/auth/${id}/start${as ? `?as=${as}` : ""}`}>
            <img className="provider-logo" src={`/logos/${id}.png`} alt="" width={20} height={20} />
            {verb} with {PROVIDERS[id].label}
          </a>
        ) : (
          <span key={id} className={`btn provider provider-${id} provider-off`} aria-disabled="true" title="Not connected on this server">
            <img className="provider-logo" src={`/logos/${id}.png`} alt="" width={20} height={20} />
            {verb} with {PROVIDERS[id].label}
            <span className="tag tag-quiet">not connected</span>
          </span>
        ),
      )}
    </div>
  );
}
