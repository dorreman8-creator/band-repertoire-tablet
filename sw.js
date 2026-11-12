const CACHE='band-repertoire-v18';
const ASSETS=['./','index.html','styles.css','viewer-controls.css','annotations.css?v=1','annotations.js?v=1','app.js?v=16','agenda.js?v=1','manifest.webmanifest','icon.svg','vendor/pdfjs/pdf.mjs','vendor/pdfjs/pdf.worker.mjs'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./'))))});
