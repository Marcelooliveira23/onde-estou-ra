/* Service worker: guarda o app no iPhone para abrir rápido e funcionar sem internet.
   Bibliotecas e alvos (pesados, não mudam): cache primeiro.
   Páginas, código e config (podem mudar): rede primeiro, cache se estiver offline. */
const VERSAO = 'decora-ra-v11';
const ARQUIVOS = ['./', 'index.html', 'simulador.html', 'marcadores.html', 'config.js', 'css/estilo.css',
  'js/casa.js', 'js/maquete.js', 'js/app.js', 'js/sim.js', 'js/minimapa3d.js', 'js/moveis_proc.js', 'js/gravador.js', 'js/moveis.js', 'js/decor.js', 'livre.html', 'js/livre.js', 'explicacao.html', 'mapear.html', 'js/mapear.js', 'js/ia_paredes.js', 'vr.html', 'js/vr.js', 'lib/jsm/effects/StereoEffect.js', 'lib/jsm/controls/OrbitControls.js', 'lib/three.module.min.js', 'lib/alva_ar.js', 'lib/jsm/loaders/GLTFLoader.js', 'lib/jsm/utils/BufferGeometryUtils.js', 'lib/qrcode.min.js', 'lib/aframe.min.js', 'lib/mindar-image-aframe.prod.js',
  'targets.mind', 'manifest.webmanifest', 'icones/icone-180.png', 'icones/icone-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  const pesado = /\/lib\/|targets\.mind|\/icones\/|\/marcadores\/|\/modelos\//.test(url.pathname);
  if (pesado) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      const copia = resp.clone(); caches.open(VERSAO).then(c => c.put(e.request, copia)); return resp;
    })));
  } else {
    e.respondWith(fetch(e.request).then(resp => {
      const copia = resp.clone(); caches.open(VERSAO).then(c => c.put(e.request, copia)); return resp;
    }).catch(() => caches.match(e.request)));
  }
});
