import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Archivo, Spline_Sans_Mono, Noto_Nastaliq_Urdu } from "next/font/google";
import "./globals.css";

// Self-hosted via next/font — no external request, no FOUT, no layout shift.
// The previous <link> to fonts.googleapis.com made every first paint flash
// system fonts, which is most of why the UI read as unfinished.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});
const splineMono = Spline_Sans_Mono({
  subsets: ["latin"],
  variable: "--font-spline",
  display: "swap",
});
const nastaliq = Noto_Nastaliq_Urdu({
  subsets: ["arabic"],
  weight: ["400", "500", "600"],
  variable: "--font-nastaliq",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Khata",
  description: "Speak or type — it keeps the books for you",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Khata" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0e1a1c" },
    { media: "(prefers-color-scheme: light)", color: "#e8e9e4" },
  ],
};

// Runs before first paint so a stored theme choice never flashes the wrong
// surface. No stored choice => no data-theme attribute => the
// prefers-color-scheme block in globals.css decides.
const THEME_INIT = `try{var t=localStorage.getItem("khata-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
// Same pre-paint treatment for the accent-color and text-size pickers
// (lib/use-accent.ts, lib/use-text-size.ts) — a stored non-default choice
// should never flash the marigold/medium default on first paint either.
const ACCENT_INIT = `try{var a=localStorage.getItem("khata-accent");if(a&&a!=="marigold")document.documentElement.dataset.accent=a}catch(e){}`;
const TEXT_SIZE_INIT = `try{var s=localStorage.getItem("khata-text-size");if(s&&s!=="medium")document.documentElement.dataset.textSize=s}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${archivo.variable} ${splineMono.variable} ${nastaliq.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <script dangerouslySetInnerHTML={{ __html: ACCENT_INIT }} />
        <script dangerouslySetInnerHTML={{ __html: TEXT_SIZE_INIT }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
