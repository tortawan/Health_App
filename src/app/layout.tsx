import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "./toast-provider";

export const metadata: Metadata = {
  title: "Visual RAG Food Tracker",
  description:
    "AI-first nutrition logging that combines Gemini perception with Supabase vector search.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-50">
        <div className="mx-auto max-w-5xl px-6 py-10">{children}</div>
        <ToastProvider />
      </body>
    </html>
  );
}
