import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { Analytics } from "@vercel/analytics/next";
import { SiteHeader, SiteFooter } from "@/components/site-shell";
import { AccountMenu } from "@/features/auth/account-menu";
import { getCurrentUser } from "@/features/auth/current-user";
import { listSavedIds } from "@/features/holds/repository";
import { THEME_INITIALIZATION_SCRIPT } from "@/lib/theme";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

const DESCRIPTION =
  "Discover and share 3D printable climbing holds for home walls and training boards. Browse STL files by hold type, size, mounting, material, and suggested grade at 40°.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "3D Printable Climbing Holds & STL Files | Garage Holds",
    template: "%s | Garage Holds",
  },
  description: DESCRIPTION,
  // Link previews in chats and on social sites. Design pages add their own
  // title, description, and photo.
  openGraph: {
    siteName: "Garage Holds",
    type: "website",
    title: "3D Printable Climbing Holds & STL Files",
    description: DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image" },
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const user = await getCurrentUser();
  const savedCount = user ? (await listSavedIds()).length : 0;
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: THEME_INITIALIZATION_SCRIPT }}
        />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <SiteHeader account={<AccountMenu />} savedCount={savedCount} />
        <div id="main-content">{children}</div>
        <SiteFooter signedIn={user !== null} />
        <Analytics />
      </body>
    </html>
  );
}
