import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LibraryProvider } from "@/components/library-provider";
import { SiteHeader, SiteFooter } from "@/components/site-shell";
import { AccountMenu } from "@/features/auth/account-menu";
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INITIALIZATION_SCRIPT }}
        />
      </head>
      <body>
        <LibraryProvider>
          <a href="#main-content" className="skip-link">
            Skip to content
          </a>
          <SiteHeader account={<AccountMenu />} />
          <div id="main-content">{children}</div>
          <SiteFooter />
        </LibraryProvider>
      </body>
    </html>
  );
}
