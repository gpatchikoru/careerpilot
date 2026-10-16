import type { Metadata } from "next";
import "./globals.css";
import { appPath } from "@/lib/app-path";

export const metadata: Metadata = {
  title: "CareerPilot — Your next chapter starts here",
  description: "Your private workspace for job discovery, tailored resumes, and application tracking.",
  icons: {
    icon: appPath("/favicon.svg"),
    shortcut: appPath("/favicon.svg"),
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
