import { ConnectCode } from "@/components/ConnectCode";
import { SignInPanel } from "@/components/SignInPanel";
import { currentUser, extToken } from "@/lib/session";

/** Hands a signed-in account's token to the browser extension. */
export default async function Connect() {
  const user = await currentUser();
  if (!user) {
    return (
      <>
        <p className="eyebrow">Browser extension</p>
        <h1>Sign in to connect the extension</h1>
        <SignInPanel title="Sign in, then come back to this tab" />
      </>
    );
  }
  return (
    <>
      <p className="eyebrow">Browser extension</p>
      <h1>Connected as {user.name}</h1>
      <p className="lede">The Potted extension picks this up on its own. You can close this tab.</p>
      <ConnectCode token={extToken(user.id)} />
    </>
  );
}
