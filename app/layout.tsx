import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verifiable Agent Memory Vault",
  description: "AI agent memory, logs, and provenance anchored with 0G Storage and 0G Chain."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

