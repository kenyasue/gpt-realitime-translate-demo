import type { Metadata } from "next";
import "./globals.scss";

export const metadata: Metadata = {
  title: "GPT Realtime Translate Demo",
  description: "Realtime translation demo built with Next.js 15.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
