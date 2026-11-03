import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Global News Dashboard · World Feed Monitor example",
  description: "News from every country and language, through the World Feed Monitor REST API.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
