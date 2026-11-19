// File: src/app/manifest.ts  (NEW file)
//
// Makes the dashboard installable on iPhone and Android (Add to Home Screen / Install app).
// Next.js serves this at /manifest.webmanifest. Icons live in public/icons/.

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/ai-leads",
    name: "DRS Lead Response",
    short_name: "DRS Leads",
    description: "Direct Relocation Services lead response dashboard: leads, AI texts and calls, and customer conversations.",
    start_url: "/ai-leads",
    scope: "/",
    display: "standalone",
    background_color: "#F5F5F5",
    theme_color: "#FFFFFF",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}