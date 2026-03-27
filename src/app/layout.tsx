import type { Metadata } from "next";
import { Fraunces, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const bodyFont = Instrument_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const displayFont = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

const monoFont = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://image-background-remover.pages.dev"),
  title: "Image Background Remover",
  description:
    "Remove background from image online with a simple Next.js MVP powered by Remove.bg.",
  openGraph: {
    title: "Image Background Remover",
    description:
      "Upload an image, remove the background automatically, and download a transparent PNG.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Image Background Remover",
    description:
      "Upload an image, remove the background automatically, and download a transparent PNG.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
