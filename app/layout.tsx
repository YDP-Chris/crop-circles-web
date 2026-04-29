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
          <Link href="/pewsey">Pewsey</Link>
          <Link href="/avebury">Avebury</Link>
          <Link href="/stonehenge">Stonehenge</Link>
          <Link href="/historical">Historical</Link>
          <Link href="/encodings">Encodings</Link>
          <Link href="/candidates">Watch</Link>
          <Link href="/insights">Insights</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
