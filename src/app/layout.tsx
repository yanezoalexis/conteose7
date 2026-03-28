import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ConteoSE7 - GPS en Tiempo Real",
  description: "Sistema de conteo de personal y GPS en tiempo real para emergencias - 7ma Compañía de Bomberos Viña del Mar",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
