import type { Metadata, Viewport } from "next";
import { Alfa_Slab_One, Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const display = Alfa_Slab_One({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

const body = Plus_Jakarta_Sans({
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
  // Next.js emits mobile-web-app-capable; keep the Apple-prefixed tag too
  // for older iOS Safari Add to Home Screen behavior.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      {
        url: "/apple-touch-icon.png",
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
  themeColor: "#1c1c1c",
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
