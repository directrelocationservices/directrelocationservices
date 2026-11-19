// File: public/sw.js  (NEW file)
//
// Small service worker for the installed app. It does NOT cache pages or data,
// so leads and conversations are always live. It only shows a friendly
// "You're offline" screen when the phone has no connection.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline | DRS Leads</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F5F5F5;color:#171717;
font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px;text-align:center}
.c{max-width:340px;background:#fff;border:1px solid #E5E5E5;border-radius:20px;padding:32px 24px;border-top:6px solid #E10600}
h1{font-size:20px;margin:0 0 8px}p{color:#737373;font-size:15px;line-height:1.5;margin:0 0 20px}
button{background:#E10600;color:#fff;border:0;border-radius:12px;padding:12px 20px;font-weight:700;font-size:15px}</style>
</head><body><div class="c"><h1>You're offline</h1><p>Leads and conversations need an internet connection. Check your signal and try again.</p>
<button onclick="location.reload()">Try again</button></div></body></html>`;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return; // everything else goes straight to the network
  event.respondWith(
    fetch(req).catch(
      () => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});