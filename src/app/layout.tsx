import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader, SiteFooter } from "@/components/site-shell";
import { AccountMenu } from "@/features/auth/account-menu";
import { getCurrentUser } from "@/features/auth/current-user";
import { listSavedIds } from "@/features/holds/repository";
import { THEME_INITIALIZATION_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "3D Printable Climbing Holds & STL Files | Garage Holds",
    template: "%s | Garage Holds",
  },
  description:
    "Discover and share 3D printable climbing holds for home walls and training boards. Browse STL files by hold type, size, mounting, material, and suggested grade at 40°.",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const savedCount = (await getCurrentUser())
    ? (await listSavedIds()).length
    : 0;
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INITIALIZATION_SCRIPT }}
        />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <SiteHeader account={<AccountMenu />} savedCount={savedCount} />
        <div id="main-content">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
