import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Banked",
  description: "Allocate exit proceeds into selected equity exposure.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
