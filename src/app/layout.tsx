import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Weizmann Mail",
  description:
    "Communication exercise platform for the Miriam and Aaron Gutwirth MD-PhD Program at the Weizmann Institute of Science."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
