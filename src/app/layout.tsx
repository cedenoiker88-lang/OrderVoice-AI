import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OrderVoice AI | Prototipo",
  description: "Asistente para tomar pedidos de una pizzería ficticia"
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
