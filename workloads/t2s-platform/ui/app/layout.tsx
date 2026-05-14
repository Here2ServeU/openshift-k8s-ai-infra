import type { Metadata, Viewport } from "next";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "T2S — Trust to Scale",
    template: "%s · T2S",
  },
  description:
    "Evaluation and assurance for AI agents and ML/robotic systems being deployed into highly regulated environments.",
  applicationName: "T2S",
  authors: [{ name: "T2S Platform" }],
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0A0F1F",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-canvas text-ink-primary antialiased">
        <div className="relative z-10 flex min-h-screen">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar />
            <main className="flex-1 px-8 py-6">
              <div className="mx-auto w-full max-w-[1440px]">{children}</div>
            </main>
            <footer className="px-8 pb-6 text-caption text-ink-muted">
              <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between border-t border-border-subtle pt-4">
                <span>
                  T2S build <span className="mono text-ink-secondary">v0.2.0 · 7a3f9c1</span>
                </span>
                <span>
                  Signed by{" "}
                  <span className="mono text-ink-secondary">cosign/keyless</span> ·
                  attested SBOM
                </span>
              </div>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
