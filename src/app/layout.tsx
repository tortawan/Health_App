import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Home, BarChart3, Scale, Settings } from "lucide-react";
import "@/lib/env";
import "./globals.css";
import { ToastProvider } from "./toast-provider";
import { ServiceWorkerRegister } from "./sw-register";

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
  const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const sentryEnvironment = process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? "production";

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#10b981" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
      </head>
      <body className="min-h-screen bg-slate-950 text-slate-50" suppressHydrationWarning>
        {/* Main content with extra bottom padding for nav */}
        <div className="mx-auto max-w-5xl px-6 py-10 pb-24 md:pb-20">
          {children}
        </div>
        
        {/* Fixed footer */}
        <footer className="mt-8 border-t border-white/5 bg-slate-950/80 px-6 py-4 text-center text-xs text-white/60 backdrop-blur">
          Food images are processed by Google AI.
        </footer>

        {/* Persistent Bottom Navigation - Global access to Home */}
        <nav className="fixed bottom-20 md:bottom-4 left-0 right-0 z-50 md:max-w-5xl md:mx-auto">
          <div className="bg-slate-900/90 backdrop-blur border-t border-white/10 p-3 md:rounded-t-2xl md:shadow-2xl md:border">
            <div className="flex justify-around">
              <Link href="/" className="flex flex-col items-center p-2 rounded-xl text-white/70 hover:text-emerald-400 hover:bg-white/10 transition-all group">
                <Home className="w-6 h-6 group-hover:scale-110" />
                <span className="text-xs mt-1 font-medium">Home</span>
              </Link>
              <Link href="/stats" className="flex flex-col items-center p-2 rounded-xl text-white/70 hover:text-blue-400 hover:bg-white/10 transition-all group">
                <BarChart3 className="w-6 h-6 group-hover:scale-110" />
                <span className="text-xs mt-1 font-medium">Stats</span>
              </Link>
              <Link href="/WeightLogger" className="flex flex-col items-center p-2 rounded-xl text-white/70 hover:text-orange-400 hover:bg-white/10 transition-all group">
                <Scale className="w-6 h-6 group-hover:scale-110" />
                <span className="text-xs mt-1 font-medium">Weight</span>
              </Link>
              <Link href="/settings" className="flex flex-col items-center p-2 rounded-xl text-white/70 hover:text-purple-400 hover:bg-white/10 transition-all group">
                <Settings className="w-6 h-6 group-hover:scale-110" />
                <span className="text-xs mt-1 font-medium">Settings</span>
              </Link>
            </div>
          </div>
        </nav>

        <ToastProvider />
        <ServiceWorkerRegister />
        {sentryDsn ? (
          <>
            <Script
              crossOrigin="anonymous"
              src="https://browser.sentry-cdn.com/7.120.0/bundle.tracing.min.js"
              strategy="afterInteractive"
            />
            <Script
              id="sentry-init"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  if (window.Sentry) {
                    window.Sentry.init({
                      dsn: ${JSON.stringify(sentryDsn)},
                      environment: ${JSON.stringify(sentryEnvironment)},
                      tracesSampleRate: 0.1,
                      integrations: [
                        window.Sentry.browserTracingIntegration({
                          tracePropagationTargets: ["localhost", /^\\/api\\//],
                        })
                      ],
                    });
                  }
                `,
              }}
            />
          </>
        ) : null}
      </body>
    </html>
  );
}
