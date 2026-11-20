import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/service";
import { currentUser } from "@/lib/session";
import { Avatar } from "@/components/StreamHeader";
import { AccountProfile } from "@/components/AccountProfile";
export const metadata = { title: "Community profile · Potted", robots: { index: false } };
export default async function Profile({params}:{params:Promise<{id:string}>}) {
  const user=getUser((await params).id);
  if (!user) notFound();
  if (user.role === "streamer" && user.handle) redirect(`/s/${user.handle}`);
  const viewer=await currentUser();
  const own=viewer?.id===user.id;
  if (!own && !user.profile?.publicProfile) notFound();
  return <><div className="row between wrap"><div className="account-profile-heading"><Avatar name={user.name} handle={user.id} src={user.profile?.avatarUrl} /><div><p className="eyebrow">{user.role==="mod" ? "Keeper" : "Planter"}</p><h1>{user.name}</h1></div></div>{own && <Link href="/settings" className="btn btn-ghost">Edit profile</Link>}</div>{own && !user.profile?.publicProfile && <p className="settings-notice">Only you can see this profile. Publish it in Settings when you’re ready.</p>}<AccountProfile user={user}/></>;
}
