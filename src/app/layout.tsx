import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Universal Human Profiler (VVS)",
  description: "Vertical slice test app",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100">{children}</body>
    </html>
  );
}

