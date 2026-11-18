/* Caudal: guarda la app para que abra rápido y sin señal. Los datos siempre se piden a la hoja. */
var VERSION = 'caudal-v56';
var ARCHIVOS = ['./', 'index.html', 'styles.css', 'app.js', 'calculos.js', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'apple-touch-icon.png', 'fonts/inter-medium.woff2', 'fonts/inter-semibold.woff2', 'fonts/inter-bold.woff2'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ARCHIVOS.map(function (u) { return new Request(u, { cache: 'reload' }); })); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Red primero (para tener siempre la versión nueva); si no hay señal, lo guardado.
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    // no-cache: siempre pregunta al servidor si hay versión nueva (si no cambió, responde rápido con 304).
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) return r;
      var copia = r.clone();
      caches.open(VERSION).then(function (c) { c.put(e.request, copia); });
      return r;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (r) { return r || caches.match('index.html'); });
    })
  );
});
