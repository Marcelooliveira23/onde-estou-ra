/*
 * DECORAR SEM PLACA (RA "markerless").
 * O Safari do iPhone não tem WebXR, então o reconhecimento do ambiente é feito
 * aqui mesmo, no navegador, com SLAM visual (AlvaAR, WebAssembly):
 *   1. cada quadro da câmera vai para o SLAM, que devolve a POSE da câmera
 *      (posição + rotação) no espaço 3D que ele está mapeando;
 *   2. com pontos suficientes no mapa, o SLAM ajusta um PLANO (chão ou parede);
 *   3. o toque na tela vira um raio (Raycaster) que cruza esse plano: ali entra o objeto.
 * O giroscópio (orientação do celular) diz onde é "para cima", para saber se o
 * plano é chão ou parede e deixar os objetos em pé.
 * MODO RÁPIDO (rede de segurança): se o SLAM não achar o chão (pouca luz, chão liso)
 * ou não carregar, a câmera virtual passa a seguir só o GIROSCÓPIO (3 graus de liberdade):
 * o chão fica a 1,3 m abaixo do celular e os objetos ficam fixos enquanto você gira.
 * Teste no PC: livre.html?video=caminho.mp4 usa um vídeo no lugar da câmera.
 */
import * as THREE from 'three';
import { GLTFLoader } from '../lib/jsm/loaders/GLTFLoader.js';
import { AlvaAR } from '../lib/alva_ar.js';

window.THREE_MOVEIS = THREE; window.GLTFLOADER_MOVEIS = GLTFLoader;
for (const arq of ['js/moveis_proc.js', 'js/moveis.js']) await new Promise((ok, erro) => { const s = document.createElement('script'); s.src = arq; s.onload = ok; s.onerror = erro; document.head.appendChild(s); });
const Moveis = window.Moveis;

const $ = id => document.getElementById(id);
const VIDEO_TESTE = new URLSearchParams(location.search).get('video');
const LARG_SLAM = 360;          // largura (px) da imagem enviada ao SLAM: leve para o celular
const FOV_LADO_CURTO = 41;      // campo de visão (graus) do lado curto do vídeo 16:9 da câmera traseira
const ALTURA_CELULAR = 1.3;     // metros do chão até o celular (pessoa em pé), para achar a escala
const DIST_PAREDE = 1.5;        // metros até a parede, se a 1ª superfície for parede

const TIPOS = Moveis.TIPOS;
const estado = { modo: 'slam', rastreando: false, quadrosOk: 0, procurar: true, armado: null, sel: null, cima: null, k: null, inicio: 0 };
const planos = [], itens = [];

if (!window.isSecureContext && !VIDEO_TESTE) $('avisoHttps').hidden = false;

// ---------- giroscópio: direção "para cima" no referencial do celular ----------
let orient = null;
function ouvirOrientacao() {
  window.addEventListener('deviceorientation', e => { if (e.beta != null) orient = { a: e.alpha || 0, b: e.beta, g: e.gamma }; });
}
// orientação do celular → rotação da câmera (mesma conta do DeviceOrientationControls do three.js)
const eulerGiro = new THREE.Euler(), qTela = new THREE.Quaternion(), qAjuste = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
function cameraPeloGiroscopio() {
  if (!orient) return;
  const r = THREE.MathUtils.degToRad, tela = r((screen.orientation && screen.orientation.angle) || 0);
  eulerGiro.set(r(orient.b), r(orient.a), -r(orient.g), 'YXZ');
  camera.quaternion.setFromEuler(eulerGiro).multiply(qAjuste).multiply(qTela.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -tela));
}
function cimaNaCamera() { // vetor "para cima" do mundo, em coordenadas da câmera (celular em pé, modo retrato)
  if (!orient) return null;
  const b = THREE.MathUtils.degToRad(orient.b), g = THREE.MathUtils.degToRad(orient.g);
  return new THREE.Vector3(-Math.cos(b) * Math.sin(g), Math.sin(b), Math.cos(b) * Math.cos(g)).normalize();
}

// ---------- três.js ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const cena = new THREE.Scene();
cena.environment = Moveis.ambiente(renderer); // reflexos realistas (couro, madeira, metal, mármore)
const camera = new THREE.PerspectiveCamera(60, 1, 0.001, 1000);
cena.add(new THREE.HemisphereLight('#ffffff', '#8a7f70', 0.6));
const sol = new THREE.DirectionalLight('#ffffff', 0.9); camera.add(sol); sol.position.set(0.5, 1, 0.5); cena.add(camera);
const mundo = new THREE.Group(); cena.add(mundo);
const caixaSel = new THREE.BoxHelper(undefined, '#38bdf8'); caixaSel.material.depthTest = false; caixaSel.visible = false; cena.add(caixaSel);

// conversão da pose do AlvaAR para o three.js (mesma do conector oficial)
const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion();
function aplicarPose(pose, quat, pos) {
  m4.fromArray(pose); q4.setFromRotationMatrix(m4);
  quat.set(-q4.x, q4.y, q4.z, q4.w);
  pos.set(pose[12], -pose[13], -pose[14]);
}

// ---------- câmera / vídeo ----------
let alva, ctx, W, H, w, h, recorte;
const video = $('video');

async function abrirCamera() {
  if (VIDEO_TESTE) {
    video.src = VIDEO_TESTE; video.loop = true;
  } else {
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      audio: false, video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } });
  }
  await new Promise(ok => { if (video.readyState >= 1) ok(); else video.onloadedmetadata = ok; });
  await video.play();
}

function medir() {
  W = innerWidth; H = innerHeight;
  w = LARG_SLAM; h = Math.round(LARG_SLAM * H / W);
  const vw = video.videoWidth, vh = video.videoHeight;
  const s = Math.max(w / vw, h / vh); // mesmo enquadramento do object-fit: cover da tela
  recorte = { x: (w - vw * s) / 2, y: (h - vh * s) / 2, w: vw * s, h: vh * s };
  // distância focal (px da imagem do SLAM) a partir do campo de visão típico da câmera
  const fovLadoX = vw < vh ? FOV_LADO_CURTO : 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV_LADO_CURTO / 2)) * vw / vh) * 180 / Math.PI;
  const f = (vw * s / 2) / Math.tan(THREE.MathUtils.degToRad(fovLadoX / 2));
  return 2 * Math.atan((w / 2) / f) * 180 / Math.PI; // fov horizontal da imagem do SLAM
}

async function iniciar() {
  $('capa').hidden = true; $('carregando').hidden = false;
  // iOS: pedir o giroscópio precisa ser dentro do toque
  try {
    if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) {
      if (await DeviceOrientationEvent.requestPermission() === 'granted') ouvirOrientacao();
    } else ouvirOrientacao();
  } catch (e) { /* sem giroscópio: usa a inclinação da câmera */ }
  try { await abrirCamera(); } catch (e) {
    $('carregando').innerHTML = '<p>❌ Não foi possível abrir a câmera.<br>No iPhone: Ajustes › Apps › Safari › Câmera › Permitir, e use o endereço <b>https://</b>.</p>';
    return;
  }
  const fov = medir();
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  ctx = cv.getContext('2d', { willReadFrequently: true });
  try {
    alva = await AlvaAR.Initialize(w, h, fov);
    camera.fov = 2 * Math.atan((h / 2) / alva.intrinsics.fy) * 180 / Math.PI;
  } catch (e) { // SLAM indisponível neste aparelho: segue no modo rápido
    camera.fov = 2 * Math.atan(h / w * Math.tan(THREE.MathUtils.degToRad(fov / 2))) * 180 / Math.PI;
    alva = null;
  }
  camera.aspect = W / H; camera.updateProjectionMatrix();
  renderer.setSize(W, H, false);
  $('pontos').width = W; $('pontos').height = H;
  $('carregando').hidden = true; $('hud').hidden = false;
  montarCatalogo();
  estado.inicio = performance.now();
  if (!alva) modoRapido();
  requestAnimationFrame(quadro);
}
$('btnComecar').addEventListener('click', iniciar);

// ---------- laço principal ----------
let ultimo = 0, contador = 0;
const ptsCtx = $('pontos').getContext('2d');
function quadro(t) {
  requestAnimationFrame(quadro);
  if (t - ultimo < 30) return; // ~30 quadros por segundo
  ultimo = t;
  ptsCtx.clearRect(0, 0, W, H);
  if (estado.modo === 'giro') { cameraPeloGiroscopio(); camera.updateMatrixWorld(); desenhar(t); return; }
  // sem chão depois de 12 s: oferece o modo rápido
  $('btnRapido').hidden = !(planos.length === 0 && t - estado.inicio > 12000);
  ctx.drawImage(video, recorte.x, recorte.y, recorte.w, recorte.h);
  const pose = alva.findCameraPose(ctx.getImageData(0, 0, w, h));
  if (pose) {
    aplicarPose(pose, camera.quaternion, camera.position);
    camera.updateMatrixWorld();
    estado.quadrosOk++;
    if (!estado.rastreando) { estado.rastreando = true; status(); }
    if (estado.procurar && estado.quadrosOk > 10 && ++contador % 8 === 0) {
      const pp = alva.findPlane();
      if (pp) novoPlano(pp);
    }
    if (planos.length) pontosVerdes(true); else pontosVerdes(false);
  } else {
    estado.quadrosOk = 0;
    if (estado.rastreando) { estado.rastreando = false; status(); }
    pontosVerdes(false);
  }
  desenhar(t);
}
function desenhar(t) {
  mundo.visible = estado.rastreando;
  if (estado.sel) { caixaSel.setFromObject(estado.sel); caixaSel.visible = estado.rastreando; }
  const agora = new Date();
  for (const it of itens) { const f = it.children[0] && it.children[0].userData.atualizar; if (f) f(agora); }
  for (const p of planos) p.userData.anel.material.opacity = 0.35 + 0.15 * Math.sin(t / 300);
  renderer.render(cena, camera);
}
function pontosVerdes(poucos) { // pontos que o SLAM está seguindo (feedback de "reconhecendo")
  if (poucos) return;
  const sx = W / w, sy = H / h;
  ptsCtx.fillStyle = estado.rastreando ? '#4ade80' : '#facc15';
  for (const p of alva.getFramePoints()) ptsCtx.fillRect(p.x * sx - 2, p.y * sy - 2, 4, 4);
}

// ---------- superfícies ----------
function novoPlano(pp) {
  const tmp = new THREE.Object3D(); aplicarPose(pp, tmp.quaternion, tmp.position);
  const origem = tmp.position.clone();
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(tmp.quaternion).normalize();
  const praCamera = camera.position.clone().sub(origem);
  if (n.dot(praCamera) < 0) n.negate();
  // "para cima" do mundo: giroscópio; sem ele, o "para cima" da tela
  const cimaCam = cimaNaCamera() || new THREE.Vector3(0, 1, 0);
  const cima = cimaCam.applyQuaternion(camera.quaternion).normalize();
  estado.cima = cima;
  const chao = Math.abs(n.dot(cima)) > (orient ? 0.7 : 0.35);
  if (!estado.k) estado.k = Math.abs(praCamera.dot(n)) / (chao ? ALTURA_CELULAR : DIST_PAREDE); // unidades do SLAM por metro
  criarPlano(origem, n, chao);
}
function criarPlano(origem, n, chao) {
  const g = new THREE.Group();
  g.position.copy(origem);
  orientar(g, n, chao);
  g.scale.setScalar(estado.k);
  g.userData = { n, chao };
  // anel que mostra a superfície encontrada
  const anel = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.3, 48), new THREE.MeshBasicMaterial({ color: chao ? '#22c55e' : '#38bdf8', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
  const grade = new THREE.Mesh(new THREE.CircleGeometry(0.6, 48), new THREE.MeshBasicMaterial({ color: chao ? '#22c55e' : '#38bdf8', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  for (const m of [anel, grade]) { if (chao) m.rotation.x = -Math.PI / 2; g.add(m); }
  g.userData.anel = anel; g.userData.visuais = [anel, grade];
  mundo.add(g); planos.push(g);
  estado.procurar = false;
  if (navigator.vibrate) navigator.vibrate(40);
  $('passos').hidden = true; $('barra').hidden = false; $('btnRapido').hidden = true;
  aviso(chao ? '✅ Chão encontrado!' : '✅ Parede encontrada!', chao ? '#16a34a' : '#0284c7');
  status(); ui();
}

// ---------- modo rápido (giroscópio) ----------
function chaoVirtual() {
  estado.cima = new THREE.Vector3(0, 1, 0);
  criarPlano(new THREE.Vector3(camera.position.x, -ALTURA_CELULAR, camera.position.z), new THREE.Vector3(0, 1, 0), true);
}
function paredeVirtual(dist = 2) { // parede de frente para o celular, a ~2 m
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); f.y = 0;
  if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
  f.normalize();
  criarPlano(camera.position.clone().addScaledVector(f, dist).setY(0), f.clone().negate(), false);
}
function modoRapido() {
  estado.modo = 'giro'; estado.k = 1; estado.rastreando = true; estado.procurar = false;
  for (const g of planos) mundo.remove(g);
  planos.length = 0; itens.length = 0;
  camera.position.set(0, 0, 0); cameraPeloGiroscopio(); camera.updateMatrixWorld();
  chaoVirtual();
  aviso('⚡ Modo rápido: chão a 1,3 m', '#7c3aed');
}
// base do plano: chão → Y = normal; parede → Z = normal e Y = "para cima"
function orientar(g, n, chao) {
  const cima = estado.cima || new THREE.Vector3(0, 1, 0);
  let X, Y, Z;
  if (chao) {
    Y = n.clone();
    const direita = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    X = direita.sub(Y.clone().multiplyScalar(direita.dot(Y))).normalize();
    Z = new THREE.Vector3().crossVectors(X, Y); // aponta para a câmera: objetos "de frente"
  } else {
    Z = n.clone();
    Y = cima.clone().sub(Z.clone().multiplyScalar(cima.dot(Z)));
    if (Y.lengthSq() < 1e-4) Y = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    Y.normalize();
    X = new THREE.Vector3().crossVectors(Y, Z);
  }
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
}

// ---------- toque: colocar, selecionar, arrastar ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), dedos = new Map();
let arrasto = null, pinca = null;
function raio(e) {
  const r = $('gl').getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
function pontoNoPlano(g) { // ponto local (metros) onde o raio cruza o plano g
  g.updateWorldMatrix(true, false);
  const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(g.userData.n, g.position);
  const out = new THREE.Vector3();
  if (!ray.ray.intersectPlane(pl, out)) return null;
  if (out.clone().sub(camera.position).dot(ray.ray.direction) < 0) return null;
  return g.worldToLocal(out);
}
function planoMaisProximo() {
  let melhor = null, dist = Infinity;
  for (const g of planos) {
    const p = pontoNoPlano(g); if (!p) continue;
    const d = g.localToWorld(p.clone()).distanceTo(camera.position);
    if (d < dist) { dist = d; melhor = { g, p }; }
  }
  return melhor;
}

$('gl').addEventListener('pointerdown', e => {
  dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (dedos.size === 2 && estado.sel) {
    const [a, b] = [...dedos.values()];
    pinca = { d: Math.hypot(a.x - b.x, a.y - b.y), esc: estado.sel.userData.esc }; arrasto = null; return;
  }
  if (!estado.rastreando || !planos.length) return;
  raio(e);
  if (estado.armado) {
    const alvo = planoMaisProximo();
    if (!alvo) { aviso('Toque em cima da superfície encontrada', '#0f172a'); return; }
    colocar(estado.armado, alvo.g, alvo.p); estado.armado = null; ui(); return;
  }
  const hits = ray.intersectObjects(itens, true);
  if (hits.length) {
    let o = hits[0].object; while (o && !itens.includes(o)) o = o.parent;
    selecionar(o);
    const p = pontoNoPlano(o.parent);
    arrasto = p && { o, d: o.position.clone().sub(p) };
    return;
  }
  selecionar(null);
});
window.addEventListener('pointermove', e => {
  if (!dedos.has(e.pointerId)) return;
  dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinca && estado.sel && dedos.size >= 2) {
    const [a, b] = [...dedos.values()];
    estado.sel.userData.esc = THREE.MathUtils.clamp(pinca.esc * Math.hypot(a.x - b.x, a.y - b.y) / pinca.d, 0.2, 4);
    estado.sel.scale.setScalar(estado.sel.userData.esc); return;
  }
  if (!arrasto || !estado.rastreando) return;
  raio(e);
  const p = pontoNoPlano(arrasto.o.parent);
  if (p) { const y0 = arrasto.o.position.y; arrasto.o.position.copy(p.add(arrasto.d)); if (arrasto.o.parent.userData.chao) arrasto.o.position.y = y0; else arrasto.o.position.z = 0.004; }
});
const soltar = e => { dedos.delete(e.pointerId); if (dedos.size < 2) pinca = null; if (!dedos.size) arrasto = null; };
window.addEventListener('pointerup', soltar);
window.addEventListener('pointercancel', soltar);

function colocar(tipo, g, p) {
  const o = new THREE.Group();
  const m = Moveis.criar(tipo, 0);
  o.add(m);
  o.userData = { tipo, v: 0, esc: 1 };
  m.userData.pronto.then(() => { if (estado.sel === o) { caixaSel.setFromObject(o); ui(); } });
  o.position.set(p.x, g.userData.chao ? 0 : p.y, g.userData.chao ? p.z : 0.004);
  if (!g.userData.chao && TIPOS[tipo].local === 'chao') { // item de chão numa parede: fica "em pé" encostado nela
    o.rotation.x = Math.PI / 2; o.position.z = 0.25;
  }
  if (g.userData.chao && TIPOS[tipo].local === 'parede') o.position.y = TIPOS[tipo].dim[1] / 2; // quadro no chão: apoiado, em pé
  if (g.userData.chao && TIPOS[tipo].local === 'teto') o.position.y = 2.55; // lustre/pendente: pendurado no teto, acima do ponto tocado
  g.add(o); itens.push(o);
  g.userData.visuais.forEach(v => { v.visible = false; }); // some o anel depois do 1º objeto
  if (navigator.vibrate) navigator.vibrate(30);
  selecionar(o);
}
function selecionar(o) { estado.sel = o; caixaSel.visible = !!o; if (o) caixaSel.setFromObject(o); ui(); }

// ---------- interface ----------
function status() {
  const st = $('status');
  if (estado.modo === 'giro') { st.className = 'achou'; $('statusTxt').textContent = '⚡ Modo rápido (giroscópio) · gire o celular'; return; }
  if (estado.rastreando && planos.length) { st.className = 'achou'; $('statusTxt').textContent = `Ambiente reconhecido · ${planos.length} superfície${planos.length > 1 ? 's' : ''}`; }
  else if (estado.rastreando) { st.className = 'procurando'; $('statusTxt').textContent = 'Mapeando… continue mexendo devagar'; }
  else { st.className = 'procurando'; $('statusTxt').textContent = planos.length ? 'Perdi o lugar · volte devagar para onde estava' : 'Reconhecendo o ambiente…'; }
  if (!planos.length) $('passosTxt').innerHTML = estado.rastreando
    ? 'Ótimo! Continue mexendo <b>devagar</b> enquanto procuro o <b>chão</b>…'
    : 'Aponte para o <b>chão</b> e mova o celular <b>devagar para os lados</b>, como se estivesse escaneando.';
}
let timerAviso;
function aviso(html, cor) {
  const a = $('aviso'); a.innerHTML = html; a.style.setProperty('--cor', cor); a.hidden = false;
  a.classList.remove('entra'); void a.offsetWidth; a.classList.add('entra');
  clearTimeout(timerAviso); timerAviso = setTimeout(() => { a.hidden = true; }, 2200);
}
function dica(t) { $('dica').innerHTML = t; }
function ui() {
  document.querySelectorAll('#catalogo .chip').forEach(b => b.classList.toggle('ativo', b.dataset.tipo === estado.armado));
  $('conta').textContent = itens.length ? `${itens.length} objeto${itens.length > 1 ? 's' : ''}` : '';
  $('edicao').hidden = !estado.sel;
  if (estado.procurar && planos.length) dica('🔍 Aponte para a outra superfície (ex.: a <b>parede</b>) e mexa devagar…');
  else if (estado.sel) {
    const t = TIPOS[estado.sel.userData.tipo], leg = estado.sel.children[0].userData.legenda;
    $('btnVariar').hidden = t.variantes < 2; $('btnVariar').textContent = t.gera === 'tapete' ? '🎨 estampa' : t.proc === 'relogio' || t.gera ? '🎨 cor' : '🎨 arte';
    $('btnGirar').hidden = !estado.sel.parent.userData.chao;
    dica(`<b>${t.nome}</b>${leg ? ` · <i>${leg}</i>` : ''}<br><small>Arraste para mover · pinça ou − + para o tamanho</small>`);
  }
  else if (estado.armado) { const t = TIPOS[estado.armado]; dica(`👆 Toque ${t.local === 'parede' ? 'na <b>parede</b>' : 'no <b>chão</b>'} onde quer: <b>${t.nome}</b>${t.local === 'parede' && !planos.some(p => !p.userData.chao) ? '<br><small>Ainda não achei uma parede: toque em ＋ superfície e aponte para ela.</small>' : ''}`); }
  else dica('Escolha um item e toque no lugar. Para a <b>parede</b>, toque em <b>＋ superfície</b> e aponte para ela.');
  if (catalogo) catalogo.marcar(estado.armado);
}
let catalogo = null;
function montarCatalogo() {
  catalogo = Moveis.montarCatalogo($('catalogo'), id => {
    estado.armado = estado.armado === id ? null : id;
    if (estado.armado && TIPOS[id].gltf) Moveis.carregarGltf(TIPOS[id].gltf); // já começa a baixar
    selecionar(null);
  });
}
$('btnGirar').onclick = () => { const o = estado.sel; if (o) { o.rotation.y += Math.PI / 4; caixaSel.setFromObject(o); } };
$('btnMenor').onclick = () => { const o = estado.sel; if (o) { o.userData.esc = Math.max(0.2, o.userData.esc / 1.15); o.scale.setScalar(o.userData.esc); } };
$('btnMaior').onclick = () => { const o = estado.sel; if (o) { o.userData.esc = Math.min(4, o.userData.esc * 1.15); o.scale.setScalar(o.userData.esc); } };
$('btnVariar').onclick = () => {
  const o = estado.sel; if (!o) return;
  o.userData.v = (o.userData.v + 1) % TIPOS[o.userData.tipo].variantes;
  o.remove(o.children[0]); const m = Moveis.criar(o.userData.tipo, o.userData.v); o.add(m);
  m.userData.pronto.then(() => selecionar(o)); selecionar(o);
};
$('btnDuplicar').onclick = () => { // ⧉ mais um igual, ao lado
  const o = estado.sel; if (!o) return;
  const { tipo, v, esc } = o.userData, p = o.position.clone(), lado = new THREE.Vector3(Math.cos(o.rotation.y), 0, -Math.sin(o.rotation.y));
  p.addScaledVector(lado, (TIPOS[tipo].dim[0] + 0.15) * esc);
  colocar(tipo, o.parent, p); const n = estado.sel;
  n.position.copy(p); n.rotation.copy(o.rotation); n.userData.esc = esc; n.scale.setScalar(esc);
  if (v) { n.userData.v = v; n.remove(n.children[0]); n.add(Moveis.criar(tipo, v)); }
  selecionar(n);
};
$('btnRemover').onclick = () => { const o = estado.sel; if (!o) return; o.parent.remove(o); itens.splice(itens.indexOf(o), 1); selecionar(null); };
$('btnSuperficie').onclick = () => {
  if (estado.modo === 'giro') { paredeVirtual(); return; } // no modo rápido: parede de frente, a 2 m
  estado.procurar = true; estado.quadrosOk = 0; selecionar(null); aviso('🔍 Aponte para a nova superfície e mexa devagar', '#0284c7'); };
$('btnTipo').onclick = () => { // corrige se o app confundiu chão com parede
  const g = estado.sel ? estado.sel.parent : planos[planos.length - 1]; if (!g) return;
  g.userData.chao = !g.userData.chao; orientar(g, g.userData.n, g.userData.chao);
  g.userData.visuais.forEach(v => { v.rotation.x = g.userData.chao ? -Math.PI / 2 : 0; });
  g.children.filter(o => itens.includes(o)).forEach(o => { o.position.set(o.position.x, g.userData.chao ? 0 : o.position.y, g.userData.chao ? o.position.z : 0.004); });
  aviso(g.userData.chao ? 'Agora é <b>chão</b>' : 'Agora é <b>parede</b>', '#0f172a');
};
$('btnRapido').onclick = () => modoRapido();
$('btnReset').onclick = () => {
  if (estado.modo === 'giro') { modoRapido(); return; }
  alva.reset();
  for (const g of planos) mundo.remove(g);
  planos.length = 0; itens.length = 0; estado.k = null; estado.procurar = true; estado.quadrosOk = 0; estado.armado = null;
  selecionar(null); $('barra').hidden = true; $('passos').hidden = false; status();
};

// AR nativo do iPhone (AR Quick Look), igual ao do localizador
const temQL = (() => { try { return document.createElement('a').relList.supports('ar'); } catch (e) { return false; } })();
$('qlLista').innerHTML = Object.values(TIPOS).filter(t => t.usdz)
  .map(t => `<a class="ql-item" rel="ar" href="modelos/usdz/${t.id}.usdz#allowsContentScaling=0"><img src="${t.foto}" alt="" loading="lazy"><span><b>${t.nome}</b><small>${t.local === 'parede' ? 'na parede' : 'no chão'}</small></span></a>`).join('');
$('qlAviso').hidden = temQL;
document.querySelectorAll('.ql-item').forEach(a => a.addEventListener('click', e => { if (!temQL) e.preventDefault(); }));
$('linkQL').onclick = e => { e.preventDefault(); $('ql').hidden = false; };
$('btnQLFechar').onclick = () => { $('ql').hidden = true; };

// ---------- 📸 foto do ambiente decorado (para salvar ou mandar no WhatsApp) ----------
$('btnFoto').onclick = () => {
  const dpr = renderer.getPixelRatio(), cw = Math.round(W * dpr), ch = Math.round(H * dpr);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const x = c.getContext('2d');
  const vw = video.videoWidth, vh = video.videoHeight, s = Math.max(cw / vw, ch / vh);
  x.drawImage(video, (cw - vw * s) / 2, (ch - vh * s) / 2, vw * s, vh * s);  // câmera
  const selVis = caixaSel.visible; caixaSel.visible = false;
  renderer.render(cena, camera); x.drawImage(renderer.domElement, 0, 0, cw, ch); // objetos 3D
  caixaSel.visible = selVis;
  x.font = `700 ${15 * dpr}px -apple-system, Segoe UI, sans-serif`; x.fillStyle = 'rgba(255,255,255,.9)';
  x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 6 * dpr;
  x.fillText('🛋️ Decora RA', 14 * dpr, 30 * dpr);
  // tudo síncrono: o iPhone só deixa compartilhar dentro do toque
  const url = c.toDataURL('image/jpeg', 0.92), bin = atob(url.split(',')[1]), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const arq = new File([u8], 'minha-decoracao.jpg', { type: 'image/jpeg' });
  const fl = $('flash'); fl.classList.remove('vai'); void fl.offsetWidth; fl.classList.add('vai');
  if (navigator.canShare && navigator.canShare({ files: [arq] })) navigator.share({ files: [arq], title: 'Minha decoração (Decora RA)' }).catch(() => {});
  else { const a = document.createElement('a'); a.href = url; a.download = arq.name; a.click(); }
  window.ULTIMA_FOTO = url;
};

// para os testes automáticos
window.LIVRE = { estado, planos, itens, armar: t => { estado.armado = t; ui(); }, modoRapido };
