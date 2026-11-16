import { redirect } from "next/navigation";
import { SignInPanel } from "@/components/SignInPanel";
import { currentUser } from "@/lib/session";

const ERRORS: Record<string, string> = {
  "not-set-up": "That sign-in option is not connected on this server yet.",
  cancelled: "Sign-in was cancelled. Nothing was changed.",
  failed: "That sign-in did not go through. Please try again.",
};

/** One place to sign in: an account you already have, or the demo. */
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <div className="login-page">
      {error && ERRORS[error] && (
        <p className="error" role="alert">
          {ERRORS[error]}
        </p>
      )}
      <SignInPanel title="Sign in to Potted" redirectTo="/" />
    </div>
  );
}
