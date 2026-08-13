import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "AllSportsLive - Live Scores for Every Sport",
  description: "Live scores, fixtures and events across cricket, football, tennis, baseball, badminton and more.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <Header />
        {children}
      </body>
    </html>
  );
}