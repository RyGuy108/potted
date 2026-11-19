import Link from "next/link";
import { redirect } from "next/navigation";
import { Beanstalk } from "@/components/Beanstalk";
import { currentUser } from "@/lib/session";
import { SIGNUP } from "./roles";

/** Pick the kind of account first; each kind has its own sign-up page. */
export default async function SignUp() {
  if (await currentUser()) redirect("/");
  return (
    <div className="login">
      <p className="eyebrow">Sign up</p>
      <h1>How will you use Potted?</h1>
      <p className="lede">Pick one. You can't switch an account between types later.</p>
      <div className="roles roles-3">
        {SIGNUP.map((r) => (
          <Link key={r.path} href={`/signup/${r.path}`} className="card role">
            <Beanstalk stage={r.stage} size={64} />
            <strong>{r.label}</strong>
            <span>{r.blurb}</span>
            <span className="muted small">{r.detail}</span>
          </Link>
        ))}
      </div>
      <p className="muted small">
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </div>
  );
}
