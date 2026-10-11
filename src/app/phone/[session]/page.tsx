import type { Metadata } from "next";
import { PhoneUploader } from "@/features/uploads/phone-uploader";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import { isR2Configured } from "@/lib/r2";

export const metadata: Metadata = {
  title: "Add photos from your phone",
  robots: { index: false, follow: false },
};

// Opened by scanning the QR code on the upload or edit page. The session id
// is the credential, so this page needs no sign-in; the server re-checks
// the session on every upload.
export default async function PhonePage({
  params,
}: {
  params: Promise<{ session: string }>;
}) {
  const { session: sessionId } = await params;
  const session = await loadSession(sessionId);
  return (
    <main className="main-container phone-page">
      <p className="eyebrow">GARAGE HOLDS</p>
      {session ? (
        <>
          <h1>
            {session.designTitle
              ? `Photos for ${session.designTitle}`
              : "Photos for your new design"}
          </h1>
          <p>
            Signed in on your computer as <strong>{session.ownerName}</strong>.
            Anything you add here appears there within a few seconds.
          </p>
          <PhoneUploader sessionId={session.id} />
        </>
      ) : (
        <>
          <h1>This code has expired.</h1>
          <p>
            Codes work for 15 minutes. Go back to your computer and press “Add
            photos from your phone” again for a new one.
          </p>
        </>
      )}
    </main>
  );
}

async function loadSession(sessionId: string) {
  if (!isR2Configured() || !isSupabaseAdminConfigured()) return null;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("phone_sessions")
    .select(
      "id, expires_at, profiles!phone_sessions_owner_id_fkey(display_name), designs(title)",
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (!data || Date.parse(data.expires_at) < Date.now()) return null;
  return {
    id: data.id,
    ownerName: data.profiles?.display_name ?? "a maker",
    designTitle: data.designs?.title ?? null,
  };
}
