import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crop Circles",
  description: "An open corpus of crop circle formations.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
