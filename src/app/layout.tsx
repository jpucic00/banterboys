import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Providers from "@/components/Providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://banterboys-production.up.railway.app"),
  title: "Banter Boys Bets",
  description: "Sports betting for the Banter Boys guild",
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
          <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
