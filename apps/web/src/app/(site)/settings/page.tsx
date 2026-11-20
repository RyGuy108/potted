import { redirect } from "next/navigation";
import { AccountSettings } from "@/components/AccountSettings";
import { currentUser } from "@/lib/session";
import { PROVIDER_IDS, PROVIDERS, isConfigured } from "@/lib/oauth";
export const metadata = { title: "Account settings · Potted" };
export default async function Settings({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string; sync?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const query = await searchParams;
  const message = query.error === "connection-cancelled" ? "Connection cancelled." : query.error ? "Could not connect that account. It may already belong to another Potted account, or the authorization expired. Try again from this page." : query.connected ? `Account connected. ${query.sync ? "Profile imported; schedule refresh is pending. Try Refresh Twitch." : "Your imported profile is ready. Custom fields have been preserved."}` : undefined;
  return <AccountSettings key={`${user.id}-${user.profile?.importedAt ?? 0}`} id={user.id} name={user.name} role={user.role} handle={user.handle} profile={user.profile ?? {}} message={message} emailLinked={user.identities?.some(i => i.provider === "email") ?? false} connections={PROVIDER_IDS.map(id => ({ id, label: PROVIDERS[id].label, configured: isConfigured(id), linked: user.identities?.some(i=>i.provider===id) ?? false }))} />;
}
