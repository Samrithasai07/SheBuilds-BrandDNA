import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrandDNA AI | Brand Onboarding",
  description: "Build a structured, retrieval-ready brand knowledge base.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
