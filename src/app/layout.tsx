import type { Metadata, Viewport } from "next";
import { Oswald, Source_Sans_3 } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const display = Oswald({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = Source_Sans_3({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.AUTH_URL ??
  "https://fantasyfootballoptimizer-kappa.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: "Gridiron IQ — Fantasy Football Optimizer",
  description:
    "SSO login, ESPN league sync, live stats, and explainable start/sit insights.",
  applicationName: "Gridiron IQ",
  appleWebApp: {
    capable: true,
    title: "Gridiron IQ",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

/**
 * Explicit viewport keeps first paint at scale 1 on iPhone Safari and when
 * launched from the Home Screen. viewport-fit=cover enables safe-area insets
 * for notch / home indicator in standalone mode.
 * Do not set maximumScale / userScalable=false — keep pinch-zoom accessible.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#14532d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} antialiased`}
    >
      <body className="flex min-h-screen flex-col text-emerald-950">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
