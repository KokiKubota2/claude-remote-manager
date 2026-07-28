import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claude Remote",
  description: "Start and control Claude Code jobs from your phone",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="mx-auto min-h-dvh max-w-lg antialiased">{children}</body>
    </html>
  );
}
