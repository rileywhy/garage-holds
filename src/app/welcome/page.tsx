import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/features/auth/profile-form";
import { getCurrentUser } from "@/features/auth/current-user";
import { safeNextPath, signInPath } from "@/features/auth/redirects";

export const metadata: Metadata = {
  title: "Set up your profile",
  robots: { index: false, follow: false },
};

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNextPath((await searchParams).next);
  const user = await getCurrentUser();
  if (!user) redirect(signInPath(next));
  if (user.onboarded) redirect(next);
  return (
    <main className="main-container form-page account-page">
      <div className="page-intro">
        <h1>Set up your profile.</h1>
        <p>
          Signed in as {user.email}. Pick the name other makers will see; you
          can change it any time from your account.
        </p>
      </div>
      <section className="form-section">
        <ProfileForm
          displayName={user.displayName}
          bio={user.bio}
          next={next}
        />
      </section>
    </main>
  );
}
