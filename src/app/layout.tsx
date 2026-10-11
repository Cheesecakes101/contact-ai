import type { Metadata, Viewport } from "next";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Contact AI — your AI-powered contacts",
  description: "Remember who people are, how you met, and how you can help each other.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4f46e5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">
        <Nav />
        <main className="mx-auto max-w-3xl px-4 pb-28 pt-5 sm:pb-12">{children}</main>
      </body>
    </html>
  );
}
