import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crop Circles",
  description: "An open corpus of crop circle formations.",
};

import Link from "next/link";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav className="site-nav">
          <Link href="/">Map</Link>
          <Link href="/findings">Findings</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
