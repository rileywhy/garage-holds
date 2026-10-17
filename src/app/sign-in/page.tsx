import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SignInForm } from "@/features/auth/sign-in-form";
import { getCurrentUser } from "@/features/auth/current-user";
import { safeNextPath } from "@/features/auth/redirects";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (await getCurrentUser()) redirect(next);
  return (
    <main className="main-container form-page sign-in-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={15} /> Back to the pile
      </Link>
      <div className="page-intro">
        <h1>Sign in to Garage Holds.</h1>
        <p>
          Browsing and downloads stay open to everyone. An account lets you
          publish designs, leave reviews, and keep saved holds across devices.
        </p>
      </div>
      {isSupabaseConfigured() ? (
        <SignInForm next={next} googleError={params.error === "google"} />
      ) : (
        <p className="error-box" role="alert">
          Accounts aren&apos;t configured in this environment. Set the Supabase
          variables from <code>.env.example</code> to enable sign-in.
        </p>
      )}
    </main>
  );
}
