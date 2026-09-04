import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Providers from "@/components/Providers";
import { isBettingDisabled, isWheelDisabled } from "@/lib/betting-status";
import {
  BETTING_DISABLED_MESSAGE,
  BETTING_DISABLED_WHEEL_LIVE_MESSAGE,
} from "@/lib/betting-flags";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://banterboys-production.up.railway.app"),
  title: "Banter Boys Bets",
  description: "Sports betting for the Banter Boys guild",
  openGraph: {
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.className} min-h-screen`}
        style={{
          background: "linear-gradient(180deg, #0f0f0f 0%, #141414 50%, #0f0f0f 100%)",
        }}
      >
        <Providers>
          <Navbar />
          {isBettingDisabled() && (
            <div
              role="alert"
              className="bg-amber-900/40 border-b border-amber-700/60 text-amber-100 text-sm text-center px-4 py-2"
            >
              {isWheelDisabled()
                ? BETTING_DISABLED_MESSAGE
                : BETTING_DISABLED_WHEEL_LIVE_MESSAGE}
            </div>
          )}
          <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
