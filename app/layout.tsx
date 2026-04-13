import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Träningsapp",
  description: "AI-stödd träningsapp för mobil",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sv"
      className="h-full antialiased"
      style={
        {
          // Lokala/systemfonter gör att build fungerar offline utan Google Fonts.
          "--font-geist-sans":
            '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif',
          "--font-geist-mono":
            '"SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
        } as React.CSSProperties
      }
    >
      <body className="min-h-full bg-gray-50 text-gray-900">
        <div className="min-h-screen flex flex-col">{children}</div>
      </body>
    </html>
  );
}
