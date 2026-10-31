import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CMV Mestre — Implantação e Gestão de CMV",
  description: "Implantação e Gestão de CMV para Gastronomia.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
