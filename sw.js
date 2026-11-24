const CACHE="three-weather-shell-v2";
const SHELL=["./","./index.html","./style.css","./app.js","./manifest.webmanifest","./icon.svg"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL))));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);
  if(url.origin===self.location.origin){
    if(url.pathname.endsWith("weather.json")){
      // 天気データはネットワーク優先（失敗時のみキャッシュ）
      event.respondWith(fetch(event.request).then(res=>{
        const copy=res.clone();
        caches.open(CACHE).then(c=>c.put("./weather.json",copy));
        return res;
      }).catch(()=>caches.match("./weather.json")));
      return;
    }
    event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
  }
});
