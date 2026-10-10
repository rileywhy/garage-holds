import Link from "next/link";
import { LogIn } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "./current-user";
import { signOut } from "./actions";

// Server Component rendered into the client header, so the header itself never
// touches auth cookies.
export async function AccountMenu() {
  if (!isSupabaseConfigured()) return null;
  const user = await getCurrentUser();
  if (!user)
    return (
      <Link href="/sign-in" className="nav-link account-sign-in">
        <LogIn size={15} /> Sign in
      </Link>
    );
  return (
    <div className="account-menu">
      <Link
        href="/account"
        className="account-link"
        aria-label={`Account for ${user.displayName}`}
      >
        <span className="avatar" aria-hidden="true">
          {user.displayName[0]?.toUpperCase()}
        </span>
        <span className="account-name">{user.displayName}</span>
      </Link>
      <form action={signOut}>
        <button type="submit" className="link-button">
          Sign out
        </button>
      </form>
    </div>
  );
}
