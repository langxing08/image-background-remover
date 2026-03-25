import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
