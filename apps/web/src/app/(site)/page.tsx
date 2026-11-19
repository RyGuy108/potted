import { redirect } from "next/navigation";
import { Marketing } from "@/components/Marketing";
import { currentUser } from "@/lib/session";

/** Visitors get the explanation; anyone signed in goes to their account page, which has everything that's theirs. */
export default async function Home() {
  const user = await currentUser();
  if (!user) return <Marketing />;
  if (user.onboarded === false) redirect("/welcome");
  redirect("/me");
}
