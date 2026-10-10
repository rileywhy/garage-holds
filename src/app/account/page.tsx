import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DisplayNameForm } from "@/features/auth/account-form";
import { getCurrentUser } from "@/features/auth/current-user";
import { signInPath } from "@/features/auth/redirects";
import { signOut } from "@/features/auth/actions";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath("/account"));
  return (
    <main className="main-container form-page account-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={15} /> Back to the library
      </Link>
      <div className="page-intro">
        <p className="eyebrow">YOUR ACCOUNT</p>
        <h1>{user.displayName}</h1>
        <p>Signed in as {user.email}.</p>
      </div>
      <section className="form-section">
        <DisplayNameForm displayName={user.displayName} />
      </section>
      <form action={signOut} className="account-sign-out">
        <button type="submit" className="button button-outline">
          Sign out
        </button>
      </form>
    </main>
  );
}
