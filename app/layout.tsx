import type { Metadata } from "next";
import "./globals.css";
import "./social.css";
import "./auth.css";
import "./features.css";
import "./location-search.css";
import "./photo-cropper.css";
import "./social-editor.css";
import "./notifications.css";
import "./brand.css";
import "./shell-layout.css";
import "./video-calls.css";

export const metadata: Metadata = {
  title: "ClicKiss | Citas para todxs",
  icons: {icon: '/brand/clikiss-icon.png', apple: '/brand/clikiss-apple.png'},
  description: "Conoce personas afines en un espacio cuidado y hecho para conexiones auténticas.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
