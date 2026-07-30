import type { MetadataRoute } from "next";

// Next.js auto-serves this at /manifest.webmanifest and injects the <link
// rel="manifest"> tag — same App Router convention portiq uses. This alone
// (icons + standalone display + theme colors) is what makes the app
// installable on Android/Chrome; a service worker isn't required for that.
// portiq's public/sw.js exists specifically for ITS push-notification
// feature, which Khata doesn't have — so no equivalent file here.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Khata",
    short_name: "Khata",
    description: "Speak or type — it keeps the books for you",
    start_url: "/",
    display: "standalone",
    background_color: "#0e1a1c",
    theme_color: "#0e1a1c",
    orientation: "portrait-primary",
    // "maskable" is deliberately omitted — the source artwork (network nodes,
    // coins, arrow tip) runs close to the edges, and Android's maskable circle
    // crop cuts hardest at the corners. "any" still installs fine everywhere;
    // it just skips Android's adaptive-icon mask shape.
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: [{ name: "Add entry", url: "/add" }],
  };
}
