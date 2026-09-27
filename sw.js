// GhostChat Service Worker v3 — 像普通App一样秒开：页面和库文件先用本机存的，后台再更新 + push
const CACHE = 'gc-v2.16';        // 随版本清掉：带版本号的聊天核心等
const SHELL = 'gc-shell';        // 页面本身（不随版本清掉，保证每次都能秒开）
const STATIC = 'gc-static';      // 第三方库（supabase / jsQR），内容不变
const GC_BASE_URL = self.location.origin + self.location.pathname.replace(/[^/]*$/, '');
const SHELL_KEY = GC_BASE_URL + 'index.html';

// ── Install: pre-cache static assets ──
self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      var files = ['./manifest.json','./icon192.png','./icon512.png','./icon-maskable.png','./apple-touch-icon.png'];
      return Promise.all(files.map(function(f){
        return c.add(f).catch(function(){});
      }));
    }).then(function(){
      // 装好就把页面和库文件先存下来，下一次打开直接秒开（失败不影响安装）
      return Promise.all([
        fetchShell().catch(function(){}),
        caches.open(STATIC).then(function(s){
          return Promise.all(['./vendor/supabase-js.js','./vendor/jsQR.js'].map(function(f){
            return s.match(f).then(function(h){ return h || s.add(f).catch(function(){}); });
          }));
        })
      ]);
    })
  );
  self.skipWaiting();
});

// ── Activate: purge stale caches (keep the shell + static libs) ──
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){return k!==CACHE&&k!==SHELL&&k!==STATIC;}).map(function(k){return caches.delete(k);}));
    })
  );
  e.waitUntil(self.clients.claim());
});

// 去网上取最新的页面；只有确实是本App的页面才存（防止把运营商/WiFi登录页之类的错误页存下来）
function fetchShell(){
  return fetch(SHELL_KEY, {cache: 'no-store', credentials: 'same-origin'}).then(function(r){
    if(!r || !r.ok) throw new Error('shell http ' + (r && r.status));
    return r.text().then(function(t){
      if(t.indexOf('var CORE_VERSION=') < 0) throw new Error('not the app page');
      var mk = function(){ return new Response(t, {status: 200, headers: {'Content-Type': 'text/html; charset=utf-8'}}); };
      // 页面里引用的聊天核心（chat-core.js?v…）也顺手存好，打开时不用再等它
      var m = t.match(/chat-core\.js\?v[\w.]+/);
      if(m){ var cu = GC_BASE_URL + m[0]; caches.open(CACHE).then(function(c){ return c.match(cu).then(function(h){ return h || c.add(cu); }); }).catch(function(){}); }
      return caches.open(SHELL).then(function(c){ return c.put(SHELL_KEY, mk()); }).then(mk, mk);
    });
  });
}
function cacheFirst(req, cacheName, fallback){
  return caches.open(cacheName).then(function(c){
    return c.match(req).then(function(hit){
      if(hit) return hit;
      return fetch(req).then(function(resp){
        if(resp && resp.status === 200){ c.put(req, resp.clone()); return resp; }
        if(fallback){ var fb = fallback(); c.put(req, fallback()); return fb; }
        return resp;
      }).catch(function(){ return fallback ? fallback() : new Response('', {status: 503}); });
    });
  });
}

// ── Fetch ──
self.addEventListener('fetch', function(e){
  var url = e.request.url;
  if(e.request.method !== 'GET') return;
  // Supabase API, metered TURN, push APIs → network only (no cache)
  if(url.indexOf('supabase.co') >= 0 || url.indexOf('metered.ca') >= 0 ||
     url.indexOf('onesignal.com') >= 0 || url.indexOf('fcm.googleapis.com') >= 0 ||
     url.indexOf('open-meteo.com') >= 0) return; // 天气要实时的（页面自己会先显示上次存的）

  // 打开App：先把本机存的页面立刻交出去（秒开），同时后台去取最新的存起来，下次打开就是新的。
  // 页面里的自动更新发现新版本时，会把新页面直接写进这里再刷新一次，所以不会卡在旧版本上。
  if(e.request.mode === 'navigate'){
    if(url.indexOf(GC_BASE_URL) !== 0) return;
    var net = fetchShell();
    e.respondWith(
      caches.open(SHELL).then(function(c){ return c.match(SHELL_KEY); }).then(function(hit){
        if(hit){ e.waitUntil(net.catch(function(){})); return hit; }
        return net.catch(function(){ return fetch(e.request); });
      }).catch(function(){ return fetch(e.request); })
    );
    return;
  }
  // 版本核对等直接读 index.html 的请求：走网络
  if(url.indexOf('index.html') >= 0) return;

  if(/\.js(\?|$)/.test(url) && url.indexOf(self.location.origin) === 0){
    // cordova.js 只在原生App里有；网页版里它不存在，每次打开都白等一次 404
    if(/\/cordova\.js(\?|$)/.test(url)){
      e.respondWith(cacheFirst(e.request, STATIC, function(){ return new Response('', {status: 200, headers: {'Content-Type': 'application/javascript'}}); }));
      return;
    }
    // 第三方库 & 带版本号的脚本（chat-core.js?v2.15）：内容跟着网址走，存下来直接用
    if(url.indexOf('/vendor/') >= 0){ e.respondWith(cacheFirst(e.request, STATIC)); return; }
    if(/\?v\d/.test(url)){ e.respondWith(cacheFirst(e.request, CACHE)); return; }
    // 其他本站脚本：网络优先，离线时用缓存兜底
    e.respondWith(
      fetch(e.request, {cache: 'no-store'}).then(function(resp){
        if(resp && resp.status === 200){
          var copy = resp.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
        }
        return resp;
      }).catch(function(){
        return caches.match(e.request).then(function(c){ return c || new Response('', {status: 503}); });
      })
    );
    return;
  }

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
