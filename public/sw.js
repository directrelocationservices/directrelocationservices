// File: public/sw.js  (REPLACE existing file)
//
// Small service worker for the installed app. It does NOT cache pages or data,
// so leads and conversations are always live. It only shows a friendly
// "You're offline" screen when the phone has no connection.
// + Phone notifications: shows the notification and opens the lead when tapped.

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

// ---------------------------------------------------------------- Phone notifications
self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    d = { title: "DRS Leads", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(d.title || "DRS Leads", {
      body: d.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: d.tag || undefined,
      renotify: Boolean(d.tag),
      data: { url: d.url || "/ai-leads" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/ai-leads", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) {
          return c
            .focus()
            .then((w) => (w && "navigate" in w ? w.navigate(url) : self.clients.openWindow(url)))
            .catch(() => self.clients.openWindow(url));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});