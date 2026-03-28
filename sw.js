// ═══════════════════════════════════════════════════════════
// SERVICE WORKER — Ingegneria RF
// File: sw.js — va caricato nella ROOT del repository GitHub
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = 'ingegneria-rf-v1';
const CACHE_STATIC = 'ingegneria-rf-static-v1';

// Risorse da mettere in cache (app shell)
const RISORSE_CACHE = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js',
];

// ── INSTALLAZIONE: mette in cache le risorse statiche ──────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(function(cache) {
      console.log('[SW] Cache iniziale in corso...');
      // Usa addAll con fallback — non blocca se alcune CDN non rispondono
      return Promise.allSettled(
        RISORSE_CACHE.map(url => cache.add(url).catch(e => console.warn('[SW] Cache skip:', url, e)))
      );
    }).then(function() {
      console.log('[SW] Installazione completata');
      return self.skipWaiting();
    })
  );
});

// ── ATTIVAZIONE: pulisce vecchie cache ─────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== CACHE_STATIC)
          .map(name => {
            console.log('[SW] Rimuovo vecchia cache:', name);
            return caches.delete(name);
          })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── FETCH: strategia Cache First per statici, Network First per API ──
self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);

  // Firebase e Google API — sempre dalla rete (dati live)
  if (url.hostname.includes('firebase') ||
      url.hostname.includes('google') ||
      url.hostname.includes('googleapis') ||
      url.hostname.includes('gstatic')) {
    // Lascia passare senza intercettare — Firebase gestisce la sua cache offline
    return;
  }

  // Risorse statiche (index.html, font, librerie CDN) — Cache First
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) {
        // Serve dalla cache, aggiorna in background (stale-while-revalidate)
        const networkUpdate = fetch(event.request)
          .then(function(response) {
            if (response && response.status === 200) {
              caches.open(CACHE_STATIC).then(cache => cache.put(event.request, response.clone()));
            }
            return response;
          })
          .catch(() => {}); // Silenzioso se offline
        return cached;
      }
      // Non in cache — prova dalla rete
      return fetch(event.request)
        .then(function(response) {
          if (response && response.status === 200 && event.request.method === 'GET') {
            const responseClone = response.clone();
            caches.open(CACHE_STATIC).then(cache => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(function() {
          // Offline e non in cache — serve index.html come fallback
          if (event.request.destination === 'document') {
            return caches.match('/index.html');
          }
        });
    })
  );
});

// ── MESSAGGIO: forza aggiornamento cache ───────────────────
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
