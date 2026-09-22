import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Gridiron IQ — Fantasy Football Optimizer",
  description:
    "SSO login, ESPN league sync, live stats, and explainable start/sit insights.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="field-atmosphere min-h-full flex flex-col text-emerald-950">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
