const CACHE="mss-mobile-screen-v9";
const APP_SHELL=["./","./index.html","./style.css","./app.js","./firebase-config.js","./manifest.webmanifest","./icon-192.svg","./icon-512.svg"];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=="GET") return;
  // Firebase/Auth/Firestore always stay online; only cache our own static files.
  if(url.origin!==self.location.origin) return;
  event.respondWith(
    fetch(event.request).then(res=>{
      const copy=res.clone();
      caches.open(CACHE).then(c=>c.put(event.request,copy));
      return res;
    }).catch(()=>caches.match(event.request))
  );
});
