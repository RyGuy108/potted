import { redirect } from "next/navigation";
import { RoleChoice } from "@/components/RoleChoice";
import { ROLES } from "@/lib/roles";
import { currentUser } from "@/lib/session";

/** A new account says what it is here to do. */
export default async function Welcome() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.onboarded !== false) redirect("/");
  return (
    <div className="login">
      <p className="eyebrow">Welcome, {user.name}</p>
      <h1>What brings you to the garden?</h1>
      <p className="lede">Pick one. It decides what you see when you sign in.</p>
      <RoleChoice planter={ROLES.fan} climber={ROLES.streamer} />
    </div>
  );
}
