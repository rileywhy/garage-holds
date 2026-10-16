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
import "./workshop.css";

const DESCRIPTION =
  "Discover and share 3D printable climbing holds for home walls and training boards. Browse STL files by hold type, size, mounting, material, and suggested grade at 40°.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "3D Printable Climbing Holds & STL Files | Garage Holds",
    template: "%s | Garage Holds",
  },
  description: DESCRIPTION,
  icons: {
    icon: [
      { url: "/favicon-16.png?v=gh-logo-3", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png?v=gh-logo-3", sizes: "32x32", type: "image/png" },
      {
        url: "/bookmark-icon.png?v=gh-logo-3",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/brand-icon.svg?v=gh-logo-3",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
    shortcut: "/favicon.ico?v=gh-logo-3",
    apple: [
      {
        url: "/apple-touch-icon.png?v=gh-logo-3",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
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
