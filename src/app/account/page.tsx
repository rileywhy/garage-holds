import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ProfileForm } from "@/features/auth/profile-form";
import { getCurrentUser } from "@/features/auth/current-user";
import { signInPath, welcomePath } from "@/features/auth/redirects";
import { signOut } from "@/features/auth/actions";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath("/account"));
  if (!user.onboarded) redirect(welcomePath("/account"));
  return (
    <main className="main-container form-page account-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={15} /> Back to the pile
      </Link>
      <div className="page-intro">
        <h1>{user.displayName}</h1>
        <p>Signed in as {user.email}.</p>
      </div>
      <section className="form-section">
        <ProfileForm displayName={user.displayName} bio={user.bio} />
      </section>
      <form action={signOut} className="account-sign-out">
        <button type="submit" className="button button-outline">
          Sign out
        </button>
      </form>
    </main>
  );
}
