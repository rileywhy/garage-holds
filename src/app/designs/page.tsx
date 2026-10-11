import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Pencil, Plus } from "lucide-react";
import { HoldCard } from "@/features/holds/hold-card";
import { listOwnHolds, listReviews } from "@/features/holds/repository";
import { getCurrentUser } from "@/features/auth/current-user";
import { signInPath } from "@/features/auth/redirects";
import { formatGigabytes } from "@/features/uploads/allowance";
import { loadAllowance } from "@/features/uploads/usage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "My designs",
  robots: { index: false, follow: false },
};

export default async function MyDesignsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath("/designs"));
  const [holds, reviews, { usage, limits }] = await Promise.all([
    listOwnHolds(user.id),
    listReviews(),
    loadAllowance(await createSupabaseServerClient(), user.id),
  ]);
  const drafts = holds.filter((hold) => hold.status === "draft").length;
  return (
    <main className="main-container">
      <section className="library-section" aria-label="Your designs">
        <div className="library-title-row">
          <div>
            <h2>
              My designs <span className="result-count">{holds.length}</span>
            </h2>
            <p>
              {drafts
                ? `${drafts} ${drafts === 1 ? "draft is" : "drafts are"} visible only to you. `
                : "Everything here is published and downloadable. "}
              Using {usage.designs} of {limits.designs} designs and{" "}
              {formatGigabytes(usage.bytes)} of {formatGigabytes(limits.bytes)}.
            </p>
          </div>
          <Link href="/upload" className="button button-dark">
            <Plus size={16} /> Upload a design
          </Link>
        </div>
        {holds.length ? (
          <div className="hold-grid">
            {holds.map((hold) => (
              <HoldCard
                hold={hold}
                reviews={reviews}
                saved={false}
                signedIn
                key={hold.id}
                actions={
                  <Link href={`/holds/${hold.id}/edit`} className="card-action">
                    <Pencil size={13} /> Edit details
                  </Link>
                }
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>Nothing published yet.</h3>
            <p>Your uploads will appear here with their status.</p>
            <Link href="/upload" className="button button-dark">
              Upload your first design <ArrowUpRight size={15} />
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
