import { redirect } from "next/navigation";
import { RoleChoice } from "@/components/RoleChoice";
import { ROLES } from "@/lib/roles";
import { keeperCodeConfigured } from "@/lib/keeper-code";
import { currentUser } from "@/lib/session";

/** A new account says what it is here to do. */
export default async function Welcome({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.onboarded !== false) redirect("/");
  const as = (await searchParams).as;
  const climber = as === "streamer";
  if (as === "mod") {
    return (
      <div className="login">
        <p className="eyebrow">Welcome, {user.name}</p>
        <h1>Enter your keeper invite code</h1>
        <p className="lede">Keepers settle disputed clips. The Potted team gives out invite codes.</p>
        <RoleChoice planter={ROLES.fan} climber={ROLES.streamer} keeper={ROLES.mod} only="mod" />
      </div>
    );
  }
  if (climber) {
    return (
      <div className="login">
        <p className="eyebrow">Welcome, {user.name}</p>
        <h1>Claim your stream address</h1>
        <p className="lede">This is the page you share with your viewers.</p>
        <RoleChoice planter={ROLES.fan} climber={ROLES.streamer} only="streamer" />
      </div>
    );
  }
  return (
    <div className="login">
      <p className="eyebrow">Welcome, {user.name}</p>
      <h1>What brings you to the garden?</h1>
      <p className="lede">Pick one. It decides what you see when you sign in.</p>
      <RoleChoice planter={ROLES.fan} climber={ROLES.streamer} keeper={keeperCodeConfigured() ? ROLES.mod : undefined} />
    </div>
  );
}
