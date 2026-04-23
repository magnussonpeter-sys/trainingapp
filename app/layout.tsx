import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "@/components/pwa/pwa-register";

export const metadata: Metadata = {
  title: "Träningsapp",
  description: "AI-stödd träningsapp för mobil",
  applicationName: "Träningsapp",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Träningsapp",
  },
  icons: {
    icon: [
      { url: "/pwa-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/pwa-icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#86efac",
};

// Kritisk mobil-fallback om genererad Tailwind-CSS inte laddas eller inte
// tolkas fullt ut i Safari. Den täcker de vanligaste shell-, kort- och
// knappklasserna så att appen inte faller tillbaka till rå HTML.
const criticalFallbackStyles = `
html,body{margin:0;min-height:100%;background:linear-gradient(180deg,#f6fbf6 0%,#eef7ef 100%);color:#0f172a;font-family:"Avenir Next","Segoe UI",Helvetica,Arial,sans-serif}
html{font-size:17px}
body{padding-bottom:env(safe-area-inset-bottom)}
a{color:inherit;text-decoration:none}
button,input,select,textarea{font:inherit;color:#0f172a}
button{-webkit-appearance:none;appearance:none}
[class~="min-h-screen"]{min-height:100vh}
[class~="min-h-full"]{min-height:100%}
[class~="mx-auto"]{margin-inline:auto}
[class~="w-full"]{width:100%}
[class~="max-w-3xl"]{max-width:48rem}
[class~="max-w-5xl"]{max-width:64rem}
[class~="px-4"]{padding-inline:1rem}
[class~="px-5"]{padding-inline:1.25rem}
[class~="py-5"]{padding-block:1.25rem}
[class~="py-6"]{padding-block:1.5rem}
[class~="p-4"]{padding:1rem}
[class~="p-5"]{padding:1.25rem}
[class~="p-6"]{padding:1.5rem}
[class~="pt-2"]{padding-top:.5rem}
[class~="pt-3"]{padding-top:.75rem}
[class~="pb-28"]{padding-bottom:7rem}
[class~="space-y-4"]>*+*{margin-top:1rem}
[class~="space-y-6"]>*+*{margin-top:1.5rem}
[class~="grid"]{display:grid}
[class~="flex"]{display:flex}
[class~="flex-col"]{flex-direction:column}
[class~="items-center"]{align-items:center}
[class~="justify-between"]{justify-content:space-between}
[class~="gap-2"]{gap:.5rem}
[class~="gap-3"]{gap:.75rem}
[class~="gap-4"]{gap:1rem}
[class~="rounded-2xl"]{border-radius:1rem}
[class~="rounded-3xl"]{border-radius:1.5rem}
[class*="rounded-[28px]"]{border-radius:28px}
[class*="rounded-[32px]"]{border-radius:32px}
[class~="rounded-full"]{border-radius:9999px}
[class~="border"]{border:1px solid #e2e8f0}
[class~="border-t"]{border-top:1px solid #e2e8f0}
[class~="border-slate-200"]{border-color:#e2e8f0}
[class~="border-rose-200"]{border-color:#fecdd3}
[class~="border-emerald-200"]{border-color:#a7f3d0}
[class~="bg-white"]{background:#fff}
[class~="bg-slate-50"]{background:#f8fafc}
[class~="bg-indigo-50"]{background:#eef2ff}
[class~="bg-lime-50"]{background:#f7fee7}
[class~="bg-lime-100"]{background:#ecfccb}
[class~="bg-emerald-50"]{background:#ecfdf5}
[class~="bg-rose-50"]{background:#fff1f2}
.\\!bg-lime-200{background:#d9f99d!important}
.\\!bg-white{background:#fff!important}
.\\!text-slate-900{color:#0f172a!important}
.\\!text-slate-800{color:#1e293b!important}
[class~="text-white"]{color:#fff}
[class~="text-slate-500"]{color:#64748b}
[class~="text-slate-600"]{color:#475569}
[class~="text-slate-700"]{color:#334155}
[class~="text-slate-800"]{color:#1e293b}
[class~="text-slate-900"],[class~="text-slate-950"]{color:#0f172a}
[class~="text-indigo-700"]{color:#4338ca}
[class~="text-emerald-800"]{color:#065f46}
[class~="text-rose-700"]{color:#be123c}
[class~="text-xs"]{font-size:.75rem;line-height:1rem}
[class*="text-[11px]"]{font-size:11px;line-height:1rem}
[class~="text-sm"]{font-size:.875rem;line-height:1.25rem}
[class~="text-lg"]{font-size:1.125rem;line-height:1.75rem}
[class~="text-xl"]{font-size:1.25rem;line-height:1.75rem}
[class~="text-2xl"]{font-size:1.5rem;line-height:2rem}
[class~="text-3xl"]{font-size:1.875rem;line-height:2.25rem}
[class~="font-medium"]{font-weight:500}
[class~="font-semibold"]{font-weight:600}
[class~="font-bold"]{font-weight:700}
[class~="tracking-tight"]{letter-spacing:-.025em}
[class~="shadow-sm"]{box-shadow:0 1px 3px rgba(15,23,42,.08)}
[class~="fixed"]{position:fixed}
[class~="bottom-0"]{bottom:0}
[class~="inset-x-0"]{left:0;right:0}
[class~="z-20"]{z-index:20}
[class~="z-40"]{z-index:40}
@media (min-width:640px){
  [class~="sm:px-6"]{padding-inline:1.5rem}
  [class~="sm:py-6"]{padding-block:1.5rem}
  [class~="sm:p-6"]{padding:1.5rem}
  [class~="sm:flex-row"]{flex-direction:row}
}
`;

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
      <head>
        <style
          // Inline fallback gör att mobil får grundlayout även om extern CSS
          // tappas av cache eller Safari-kompatibilitet.
          dangerouslySetInnerHTML={{ __html: criticalFallbackStyles }}
        />
      </head>
      <body className="min-h-full bg-gray-50 text-gray-900">
        <PwaRegister />
        <div className="min-h-screen flex flex-col">{children}</div>
      </body>
    </html>
  );
}
