import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "InboxZero", template: "%s · InboxZero" },
  description: "Your inbox, under control.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
