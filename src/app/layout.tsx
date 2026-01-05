import type { Metadata } from "next";
import Script from "next/script";
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
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#10b981" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
      </head>
      <body className="min-h-screen bg-slate-950 text-slate-50">
        <div className="mx-auto max-w-5xl px-6 py-10">{children}</div>
        <footer className="mt-8 border-t border-white/5 bg-slate-950/80 px-6 py-4 text-center text-xs text-white/60 backdrop-blur">
          Food images are processed by Google AI.
        </footer>
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
