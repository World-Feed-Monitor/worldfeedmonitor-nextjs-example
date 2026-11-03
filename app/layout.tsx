import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from "next/font/google";
import "./globals.css";

// Plex for reading; its condensed cut for datelines and the masthead, the way
// a wire service sets them. Self-hosted by next/font at build time.
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
const condensed = IBM_Plex_Sans_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-condensed" });

export const metadata: Metadata = {
  title: "Global News Dashboard · World Feed Monitor example",
  description: "News from every country and language, through the World Feed Monitor REST API.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${condensed.variable}`}>
      <body>{children}</body>
    </html>
  );
}
