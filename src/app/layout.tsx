import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "bizU - ABM Intelligence",
  description: "パーソナライズ手紙自動生成SaaS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
