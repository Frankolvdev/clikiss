import type { Metadata } from "next";
import "./globals.css";
import "./social.css";
import "./auth.css";
import "./features.css";
import "./location-search.css";
import "./photo-cropper.css";
import "./social-editor.css";
import "./notifications.css";

export const metadata: Metadata = {
  title: "Conecta | Encuentros con intención",
  description: "Conoce personas afines en un espacio cuidado y hecho para conexiones auténticas.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
