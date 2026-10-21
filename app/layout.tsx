import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daybook — Edition",
  description: "A quiet workspace for your day, projects and paperwork.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
