// GhostChat Service Worker v2.2 — never cache the HTML shell (prevents ever getting stuck on a stale page) + push
const CACHE = 'gc-v1.92';
const GC_BASE_URL = self.location.origin + self.location.pathname.replace(/[^/]*$/, '');

// ── Install: pre-cache static assets only (never the HTML document) ──
self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      var files = ['./manifest.json','./icon192.png','./icon512.png','./icon-maskable.png','./apple-touch-icon.png'];
      return Promise.all(files.map(function(f){
        return c.add(f).catch(function(){});
      }));
    })
  );
  self.skipWaiting();
});

// ── Activate: purge stale caches ──
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));
    })
  );
  e.waitUntil(self.clients.claim());
});

// ── Fetch ──
self.addEventListener('fetch', function(e){
  var url = e.request.url;
  if(e.request.method !== 'GET') return;
  // Supabase API, metered TURN, push APIs → network only (no cache)
  if(url.indexOf('supabase.co') >= 0 || url.indexOf('metered.ca') >= 0 ||
     url.indexOf('onesignal.com') >= 0 || url.indexOf('fcm.googleapis.com') >= 0) return;

  // The HTML document itself: never intercept, never cache. Let the browser's
  // normal HTTP fetch + Cache-Control handle it. This is the whole fix — a
  // custom caching strategy here is exactly what caused this app to get stuck
  // showing a years-old broken page with zero way to recover except manually
  // clearing site data. Plain browser caching self-expires and can't get stuck.
  if(e.request.mode === 'navigate' || url.indexOf('index.html') >= 0) return;

  // Everything else (icons, manifest, etc.): stale-while-revalidate.
  e.respondWith(
    caches.open(CACHE).then(function(cache){
      return cache.match(e.request).then(function(cached){
        var fresh = fetch(e.request, {cache: 'no-store'}).then(function(resp){
          if(resp && resp.status === 200 && resp.type !== 'opaque'){
            cache.put(e.request, resp.clone());
          }
          return resp;
        }).catch(function(){ return cached || new Response('Offline', {status: 503}); });
        return cached || fresh;
      });
    })
  );
});

// ── Notification click ──
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var targetUrl = GC_BASE_URL;
  if(e.notification.data && e.notification.data.url) targetUrl = e.notification.data.url;
  if(e.notification.launchURL) targetUrl = e.notification.launchURL;
  e.waitUntil(
    self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(clients){
      for(var i=0;i<clients.length;i++){
        var c=clients[i];
        if(c.url.indexOf(self.location.origin) >= 0 && 'focus' in c){
          c.postMessage({type:'deeplink',url:targetUrl});
          return c.focus();
        }
      }
      if(self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

// ── Web Push ──
self.addEventListener('push', function(e){
  if(!e.data) return;
  var data = {};
  try{data = e.data.json();}catch(err){data = {title:'💬 新消息', body: e.data.text()};}
  e.waitUntil(
    self.registration.showNotification(data.title||'💬 GhostChat', {
      body: data.body||'你收到了一条新消息',
      icon: './icon192.png', badge: './icon192.png',
      tag: data.tag||'gc-msg', renotify: true, silent: false,
      requireInteraction: false, data: {url: data.url||GC_BASE_URL}
    })
  );
});
