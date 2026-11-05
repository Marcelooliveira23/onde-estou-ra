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
import { criarGravador, cobrir } from './gravador.js';
import { narrar, ancorarAcima } from './narrador.js';

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
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, alpha: true, preserveDrawingBuffer: true }); // preserve: para foto e gravação
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
  ancorarAcima(() => ($('barra').hidden ? $('passos') : $('barra')));
  narrar('Câmera aberta. O <b>SLAM</b> (localização e mapeamento simultâneos) procura pontos na imagem para entender o ambiente em 3D. Mexa o celular devagar.');
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
    if (!estado.rastreando) { estado.rastreando = true; status(); if (!planos.length) narrar('Os <b>pontos verdes</b> são detalhes do chão que o SLAM está seguindo de um quadro para o outro: assim ele sabe como o celular se move.', 'rastreio'); }
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
  atualizarPrevia(); atualizarAnel(); cicloIA(t);
  renderer.render(cena, camera);
  mostrarMedidas();
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
  if (estado.modo !== 'giro') narrar(chao ? '<b>Chão encontrado!</b> O app ajustou um plano aos pontos 3D e calculou a escala real pela altura do celular. Agora os móveis aparecem em tamanho real.'
    : '<b>Parede encontrada!</b> Um segundo plano, em pé: agora dá para pendurar quadros, espelhos e relógios.');
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
  narrar('<b>Modo rápido:</b> sem pontos suficientes na imagem, o app usa o <b>giroscópio</b> para saber para onde o celular aponta e coloca o chão 1,3 m abaixo dele.');
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
  if (dedos.size === 2 && (estado.sel || (estado.armado && previa))) { // pinça = tamanho · girar os 2 dedos = girar o objeto (360°)
    const [a, b] = [...dedos.values()];
    pinca = { d: Math.hypot(a.x - b.x, a.y - b.y), esc: estado.sel ? estado.sel.userData.esc : 1, ang: Math.atan2(b.y - a.y, b.x - a.x), rot: estado.sel ? girarDe(estado.sel) : previa.rot }; arrasto = null; return;
  }
  if (dedos.size > 1) return;
  if (!estado.rastreando || !planos.length) return;
  raio(e);
  if (estado.armado) { // o objeto aparece onde o dedo está e acompanha o dedo; solta = fica ali
    colocando = { id: e.pointerId, ndc: ndc.clone() }; return;
  }
  if (estado.sel && anel.visible && ray.intersectObjects([anelAro, anelPega], false).length) { girando = true; return; } // anel de giro 360°
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
  if (pinca && dedos.size >= 2) {
    const [a, b] = [...dedos.values()];
    let giro = pinca.rot - (Math.atan2(b.y - a.y, b.x - a.x) - pinca.ang);
    const graus = ((giro * 180 / Math.PI) % 360 + 360) % 360, perto = Math.round(graus / 45) * 45;
    if (Math.abs(graus - perto) < 4) giro = perto * Math.PI / 180; // ímã nos 0°, 45°, 90°…
    if (estado.sel) {
      estado.sel.userData.esc = THREE.MathUtils.clamp(pinca.esc * Math.hypot(a.x - b.x, a.y - b.y) / pinca.d, 0.2, 4);
      estado.sel.scale.setScalar(estado.sel.userData.esc); girar(estado.sel, giro);
    } else if (previa) previa.rot = giro;
    return;
  }
  if (colocando && colocando.id === e.pointerId) { raio(e); colocando.ndc.copy(ndc); return; }
  if (girando && estado.sel) { // gira pelo anel: o ângulo do dedo em volta do objeto
    raio(e); const o = estado.sel, p = pontoNoPlano(o.parent); if (!p) return;
    const dx = p.x - o.position.x, dy = noChao(o) ? p.z - o.position.z : p.y - o.position.y;
    let th = noChao(o) ? Math.atan2(dx, dy) : Math.atan2(-dx, dy);
    const graus = ((th * 180 / Math.PI) % 360 + 360) % 360, perto = Math.round(graus / 45) * 45;
    if (Math.abs(graus - perto) < 4) th = perto * Math.PI / 180;
    girar(o, th); return;
  }
  if (!arrasto || !estado.rastreando) return;
  raio(e);
  const g = arrasto.o.parent, sobre = g.userData.chao && TIPOS[arrasto.o.userData.tipo].local === 'chao' && tampos.length ? ray.intersectObjects(tampos.filter(t => t.parent.parent === g), false)[0] : null;
  if (sobre) { const p = g.worldToLocal(sobre.point.clone()); arrasto.o.position.set(p.x, sobre.object.userData.d.h, p.z); return; } // arrastou para cima de um móvel detectado
  const p = pontoNoPlano(g);
  if (p) { arrasto.o.position.copy(p.add(arrasto.d)); if (g.userData.chao) { if (TIPOS[arrasto.o.userData.tipo].local === 'chao' && noChao(arrasto.o)) arrasto.o.position.y = 0; } else arrasto.o.position.z = 0.004; } // saiu de cima do móvel: volta ao chão
});
const soltar = e => {
  if (colocando && colocando.id === e.pointerId) { colocando = null; if (previa && previa.alvo) colocarNaMira(); else aviso('Arraste até a <b>superfície</b> encontrada', '#0f172a'); }
  if (girando) { girando = false; if (estado.sel) narrar(`Girado para <b>${Math.round((((girarDe(estado.sel) * 180 / Math.PI) % 360) + 360) % 360)}°</b> pelo anel: arraste a bolinha azul em volta para virar o objeto para qualquer lado.`, 'anel'); }
  dedos.delete(e.pointerId); if (dedos.size < 2) pinca = null; if (!dedos.size) arrasto = null;
};
window.addEventListener('pointerup', soltar);
window.addEventListener('pointercancel', soltar);

function posicionarNovo(o, tipo, g, p) {
  o.position.set(p.x, g.userData.chao ? 0 : p.y, g.userData.chao ? p.z : 0.004);
  if (!g.userData.chao && TIPOS[tipo].local === 'chao') { // item de chão numa parede: fica "em pé" encostado nela
    o.rotation.x = Math.PI / 2; o.position.z = 0.25;
  }
  if (g.userData.chao && TIPOS[tipo].local === 'parede') o.position.y = TIPOS[tipo].dim[1] / 2; // quadro no chão: apoiado, em pé
  if (g.userData.chao && TIPOS[tipo].local === 'teto') o.position.y = 2.55; // lustre/pendente: pendurado no teto, acima do ponto tocado
}
function colocar(tipo, g, p, rot = 0, topo = 0) {
  const o = new THREE.Group();
  const m = Moveis.criar(tipo, 0);
  o.add(m);
  o.userData = { tipo, v: 0, esc: 1 };
  m.userData.pronto.then(() => { o.userData.dims = null; if (estado.sel === o) { caixaSel.setFromObject(o); ui(); } });
  posicionarNovo(o, tipo, g, p); g.add(o); girar(o, rot);
  if (topo && g.userData.chao && TIPOS[tipo].local === 'chao') o.position.y = topo; // em cima do móvel detectado pela IA
  itens.push(o);
  narrar(`Pronto: <b>${TIPOS[tipo].nome}</b> no lugar, em tamanho real e <b>ancorado</b>: pode andar em volta que ele não sai dali. Dois dedos giram 360°.`, 'colocado-' + tipo);
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
  $('barra').classList.toggle('compacta', !!(estado.armado || estado.sel)); // a tela fica livre para posicionar
  if (estado.procurar && planos.length) dica('🔍 Aponte para a outra superfície (ex.: a <b>parede</b>) e mexa devagar…');
  else if (estado.sel) {
    const t = TIPOS[estado.sel.userData.tipo], leg = estado.sel.children[0].userData.legenda;
    $('btnVariar').hidden = t.variantes < 2; $('btnVariar').textContent = t.gera === 'tapete' ? '🎨 estampa' : t.proc === 'relogio' || t.gera ? '🎨 cor' : '🎨 arte';

    dica(`<b>${t.nome}</b>${leg ? ` · <i>${leg}</i>` : ''}<br><small>Arraste para mover · <b>gire pela bolinha azul do anel</b>, com 2 dedos ou na barra (360°) · pinça ou − + para o tamanho</small>`);
    sincronizarGiro();
  }
  else if (estado.armado) { // ficha do produto, como numa loja
    const t = TIPOS[estado.armado], d = t.dim, cm = v => Math.round(v * 100);
    dica(`<div class="ficha"><img src="${t.foto}" alt=""><div><b>${t.nome}</b><small>${t.local === 'parede' ? `${cm(d[0])} × ${cm(d[1])} cm` : `L ${cm(d[0])} × P ${cm(d[2])} × A ${cm(d[1])} cm`}</small><small>${t.cat}${t.variantes > 1 ? ` · ${t.variantes} opções de ${t.gera === 'tapete' ? 'estampa' : t.gera || t.proc === 'relogio' ? 'cor' : 'obra'}` : ''}</small></div></div>
      <div class="ficha-acoes"><button id="btnColocar">📍 Colocar aqui</button><button id="btnCancelarFicha">✕</button></div>
      <small><b>Toque e arraste</b> o dedo até o lugar ${t.local === 'parede' ? 'na <b>parede</b>' : 'no <b>chão</b>'}${t.local === 'chao' && tampos.length ? ' ou <b>em cima de um móvel</b> que a IA reconheceu' : ''}: solte e ele fica ali. Ou mire com o círculo e toque em <b>Colocar</b>. <b>Dois dedos giram</b>.${t.local === 'parede' && !planos.some(p => !p.userData.chao) ? ' Ainda não achei uma parede: toque em ＋ superfície.' : ''}</small>`); }
  else dica('Escolha um item e toque no lugar. Para a <b>parede</b>, toque em <b>＋ superfície</b> e aponte para ela.');
  if (catalogo) catalogo.marcar(estado.armado);
}
let catalogo = null;
function montarCatalogo() {
  catalogo = Moveis.montarCatalogo($('catalogo'), id => {
    estado.armado = estado.armado === id ? null : id; if (!estado.armado) tirarPrevia();
    if (estado.armado && TIPOS[id].gltf) Moveis.carregarGltf(TIPOS[id].gltf); // já começa a baixar
    if (estado.armado) { const t = TIPOS[id], d = t.dim, c = v => Math.round(v * 100); narrar(`<b>${t.nome}</b>: ${t.gltf ? 'modelo 3D <b>escaneado de um objeto real</b>' : 'móvel 3D feito em código'}, com as medidas reais (${c(d[0])} × ${c(d[2])} × ${c(d[1])} cm). A prévia transparente segue a mira, como no "ver no seu ambiente" das lojas.`); }
    selecionar(null);
  });
}
// ---------- giro livre de 360° ----------
const noChao = o => o.parent && o.parent.userData.chao && Math.abs(o.rotation.x) < 0.01;
function girarDe(o) { return noChao(o) ? o.rotation.y : o.rotation.z; }
function girar(o, rad) { if (noChao(o)) o.rotation.y = rad; else o.rotation.z = rad; if (o === estado.sel) { caixaSel.setFromObject(o); sincronizarGiro(); } }
function sincronizarGiro() {
  if (!estado.sel) return; const g = Math.round((((girarDe(estado.sel) * 180 / Math.PI) % 360) + 360) % 360) % 360;
  $('faixaGiro').value = g; $('grausTxt').textContent = g + '°';
}
$('faixaGiro').addEventListener('input', e => { const o = estado.sel; if (o) girar(o, -(+e.target.value) * Math.PI / 180 * -1); });
$('faixaGiro').addEventListener('change', e => narrar(`Girado para <b>${e.target.value}°</b>: dá para virar o móvel para qualquer direção do cômodo.`, 'giro'));
$('btnGirar').onclick = () => { const o = estado.sel; if (o) girar(o, girarDe(o) - Math.PI / 12); };
$('btnGirarE').onclick = () => { const o = estado.sel; if (o) girar(o, girarDe(o) + Math.PI / 12); };
// ---------- 📏 medidas do objeto (largura × profundidade × altura), como nas lojas ----------
let verMedidas = true;
function dimsDe(o) {
  o.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(o.matrixWorld).invert(), b = new THREE.Box3();
  o.traverse(m => { if (m.isMesh && !m.userData.sombra && m.geometry) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld))); } });
  return b.isEmpty() ? null : b.getSize(new THREE.Vector3());
}
const caixaTmp = new THREE.Box3(), vTmp = new THREE.Vector3();
function mostrarMedidas() {
  const el = $('medidaSel'), o = estado.sel;
  if (!o || !verMedidas || !estado.rastreando) { el.hidden = true; return; }
  if (!o.userData.dims) o.userData.dims = dimsDe(o);
  const s = o.userData.dims; if (!s) { el.hidden = true; return; }
  const k = o.userData.esc || 1, cm = v => Math.round(v * k * 100);
  el.textContent = noChao(o) || TIPOS[o.userData.tipo].local !== 'parede' ? `${cm(s.x)} × ${cm(s.z)} × ${cm(s.y)} cm` : `${cm(s.x)} × ${cm(s.y)} cm`;
  caixaTmp.setFromObject(o); caixaTmp.getCenter(vTmp); vTmp.y = caixaTmp.max.y; vTmp.project(camera);
  if (vTmp.z > 1) { el.hidden = true; return; }
  el.style.left = ((vTmp.x + 1) / 2 * W) + 'px'; el.style.top = Math.max(70, (1 - vTmp.y) / 2 * H - 18) + 'px'; el.hidden = false;
}
$('btnMedidas').onclick = () => { verMedidas = !verMedidas; $('btnMedidas').classList.toggle('ligado', verMedidas); };
// ---------- prévia "fantasma" na mira (como o "Ver no seu ambiente" das lojas) ----------
let previa = null;
const centroTela = new THREE.Vector2(0, 1 - 2 * 0.33); // a mira fica a 1/3 da altura (acima do painel)
function fantasmear(m) {
  m.traverse(o => { if (o.isMesh && !o.userData.sombra) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; o.material.depthWrite = false; } });
}
function tirarPrevia() { if (previa && previa.o.parent) previa.o.parent.remove(previa.o); previa = null; $('miraLivre').hidden = true; }
function atualizarPrevia() {
  const tipo = estado.armado;
  if (!tipo || !planos.length || !estado.rastreando) { if (previa) previa.o.visible = false; $('miraLivre').hidden = !tipo; return; }
  if (!previa || previa.tipo !== tipo) {
    tirarPrevia(); const o = new THREE.Group(), m = Moveis.criar(tipo, 0); o.add(m); fantasmear(m); m.userData.pronto.then(() => fantasmear(m));
    previa = { tipo, o, rot: 0 };
  }
  $('miraLivre').hidden = !!colocando;
  ray.setFromCamera(colocando ? colocando.ndc : centroTela, camera);
  let alvo = null;
  if (TIPOS[tipo].local === 'chao' && tampos.length) { // em cima de uma mesa/cômoda/estante que a IA reconheceu
    const h = ray.intersectObjects(tampos, false)[0];
    if (h) { const g = h.object.parent.parent; alvo = { g, p: g.worldToLocal(h.point.clone()), topo: h.object.userData.d.h }; }
  }
  if (!alvo) alvo = planoMaisProximo();
  previa.alvo = alvo;
  $('miraLivre').classList.toggle('ok', !!alvo);
  tampos.forEach(t => { t.material.opacity = TIPOS[tipo].local === 'chao' ? (alvo && alvo.topo && t.userData.d.h === alvo.topo ? 0.5 : 0.22) : 0; });
  if (!alvo) { previa.o.visible = false; return; }
  if (previa.o.parent !== alvo.g) alvo.g.add(previa.o);
  previa.o.rotation.set(0, 0, 0); posicionarNovo(previa.o, tipo, alvo.g, alvo.p); if (alvo.topo) previa.o.position.y = alvo.topo;
  if (alvo.g.userData.chao && Math.abs(previa.o.rotation.x) < 0.01) previa.o.rotation.y = previa.rot; else previa.o.rotation.z = previa.rot;
  previa.o.visible = true;
}
function colocarNaMira() {
  if (!previa || !previa.alvo) return aviso('Mire a <b>superfície</b> (círculo verde) e tente de novo', '#0f172a');
  colocar(estado.armado, previa.alvo.g, previa.alvo.p, previa.rot, previa.alvo.topo || 0); estado.armado = null; tirarPrevia(); ui();
  tampos.forEach(t => { t.material.opacity = 0; });
}
$('dica').addEventListener('click', e => {
  if (e.target.closest('#btnColocar')) colocarNaMira();
  else if (e.target.closest('#btnCancelarFicha')) { estado.armado = null; tirarPrevia(); ui(); }
});
window.addEventListener('keydown', e => { if (e.key === 'Enter' && estado.armado) colocarNaMira(); });
$('btnMenor').onclick = () => { const o = estado.sel; if (o) { o.userData.esc = Math.max(0.2, o.userData.esc / 1.15); o.scale.setScalar(o.userData.esc); } };
$('btnMaior').onclick = () => { const o = estado.sel; if (o) { o.userData.esc = Math.min(4, o.userData.esc * 1.15); o.scale.setScalar(o.userData.esc); } };
$('btnVariar').onclick = () => {
  narrar('Outra <b>cor</b> (ou outra obra, no quadro): o mesmo móvel em versões diferentes, para comparar.', 'variar');
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
  narrar('<b>Foto</b>: a imagem da câmera e os objetos 3D viram uma só foto para mandar para a família antes de comprar.', 'foto');
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

// ---------- 🔄 ANEL DE GIRO: arraste a bolinha em volta do objeto (360°) ----------
let colocando = null, girando = false;
const anel = new THREE.Group(), matAnel = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false });
const anelAro = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 72), matAnel);
const anelPega = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), new THREE.MeshBasicMaterial({ color: '#2563eb', depthTest: false }));
const anelSeta = new THREE.Mesh(new THREE.RingGeometry(0.955, 0.975, 72, 1, 0, 0.6), new THREE.MeshBasicMaterial({ color: '#2563eb', side: THREE.DoubleSide, depthTest: false }));
anelAro.renderOrder = anelPega.renderOrder = anelSeta.renderOrder = 20; anel.add(anelAro, anelSeta, anelPega); anel.visible = false;
function atualizarAnel() {
  const o = estado.sel, ok = o && estado.rastreando && !colocando && (noChao(o) || !o.parent.userData.chao);
  anel.visible = !!ok; if (!ok) return;
  if (anel.parent !== o.parent) o.parent.add(anel);
  const s = o.userData.dims, R = (s ? Math.max(s.x, noChao(o) ? s.z : s.y) / 2 : 0.4) * (o.userData.esc || 1) + 0.18, th = girarDe(o);
  if (noChao(o)) {
    anel.position.set(o.position.x, o.position.y + 0.01, o.position.z);
    anelAro.rotation.set(-Math.PI / 2, 0, 0); anelSeta.rotation.set(-Math.PI / 2, 0, th + Math.PI / 2 - 0.3);
    anelPega.position.set(Math.sin(th) * R, 0, Math.cos(th) * R);
  } else {
    anel.position.set(o.position.x, o.position.y, 0.02);
    anelAro.rotation.set(0, 0, 0); anelSeta.rotation.set(0, 0, th + Math.PI / 2 - 0.3);
    anelPega.position.set(-Math.sin(th) * R, Math.cos(th) * R, 0);
  }
  anelAro.scale.setScalar(R); anelSeta.scale.setScalar(R);
}

// ---------- 🤖 IA: reconhece a MOBÍLIA QUE JÁ EXISTE no cômodo ----------
// A mesma rede neural do Mapear (SegFormer, no celular) acha sofá, mesa, cama, cômoda, estante…
// O "pé" do móvel na imagem vira um ponto do chão (raio da câmera × plano do chão do SLAM), o topo vira a
// altura (raio × plano vertical na frente do móvel). O tampo de mesas, cômodas e estantes vira uma
// superfície de APOIO: o vaso, o porta-retrato ou a luminária ficam EM CIMA do móvel de verdade.
let IA = null, iaLigada = false, iaOcupada = false, tIA = 0;
const detectados = [], tampos = [], camFoto = new THREE.PerspectiveCamera(), rc = new THREE.Raycaster(), v2 = new THREE.Vector2();
async function ligarIA() {
  if (iaLigada) { iaLigada = false; detectados.forEach(d => d.grupo && d.grupo.parent && d.grupo.parent.remove(d.grupo)); detectados.length = 0; tampos.length = 0; $('btnIA').classList.remove('ligado'); $('btnIA').textContent = '🤖 IA'; return; }
  $('btnIA').textContent = '🤖 …';
  try {
    IA = IA || await import('./ia_paredes.js');
    await IA.carregar(p => { if (p.status === 'progress' && p.total) $('btnIA').textContent = `🤖 ${Math.round(p.loaded / p.total * 100)}%`; });
    iaLigada = true; $('btnIA').classList.add('ligado'); $('btnIA').textContent = '🤖 0';
    narrar('<b>IA ligada:</b> uma rede neural roda no celular e procura a <b>mobília que já existe</b> (sofá, mesa, cama, cômoda…). Mova o celular devagar mostrando os móveis.');
  } catch (e) { $('btnIA').textContent = '🤖 IA'; aviso('Não consegui carregar a IA (precisa de internet na 1ª vez)', '#b91c1c'); }
}
$('btnIA').onclick = ligarIA;
function noChaoLocal(u, v, g) {
  rc.setFromCamera(v2.set(u * 2 - 1, 1 - v * 2), camFoto);
  const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(g.userData.n, g.position), out = new THREE.Vector3();
  if (!rc.ray.intersectPlane(pl, out) || out.clone().sub(camFoto.position).dot(rc.ray.direction) < 0) return null;
  return g.worldToLocal(out);
}
async function cicloIA(t) {
  if (!iaLigada || !IA || !IA.pronto() || iaOcupada || t - tIA < 650 || !estado.rastreando || video.readyState < 2) return;
  const g = planos.find(p => p.userData.chao); if (!g) return;
  iaOcupada = true; tIA = t; camFoto.copy(camera); camFoto.updateMatrixWorld();
  try {
    const vw = video.videoWidth, vh = video.videoHeight, s = Math.max(W / vw, H / vh), sw = W / s, sh = H / s;
    const r = await IA.segmentar(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh);
    const mv = IA.moveis(r); window.IA_DEBUG = { classes: [...new Set(r.mapa)].slice(0, 30), mv: mv.map(m => ({ nome: m.nome, u: [m.ub0, m.ub1].map(x => +x.toFixed(2)), v: [m.vTopo, m.vBase].map(x => +x.toFixed(2)) })), rej: [] };
    for (const m of mv) medirMovel(m, g);
    mostrarDetectados(g);
  } catch (e) { console.warn(e); } finally { iaOcupada = false; }
}
function medirMovel(m, g) {
  const B = noChaoLocal(m.uc, m.vBase, g), L = noChaoLocal(m.ub0, m.vBase, g), R = noChaoLocal(m.ub1, m.vBase, g); if (!B || !L || !R) return;
  const C = g.worldToLocal(camFoto.position.clone()), dist = Math.hypot(B.x - C.x, B.z - C.z); if (dist > 6 || dist < 0.3) return;
  const n = new THREE.Vector3(C.x - B.x, 0, C.z - B.z).normalize();
  rc.setFromCamera(v2.set(m.uc * 2 - 1, 1 - m.vTopo * 2), camFoto); // topo: raio × plano vertical na frente do móvel
  const o = g.worldToLocal(rc.ray.origin.clone()), dir = g.worldToLocal(rc.ray.origin.clone().add(rc.ray.direction)).sub(o).normalize();
  const den = dir.dot(n); if (Math.abs(den) < 1e-3) return;
  const hFrente = o.y + dir.y * (B.clone().sub(o).dot(n) / den), tras = B.clone().addScaledVector(n, -m.prof);
  const hTras = o.y + dir.y * (tras.clone().sub(o).dot(n) / den);
  // câmera mais alta que o móvel: o que aparece mais alto na imagem é a borda de TRÁS do tampo
  const h = hTras < C.y - 0.05 ? hTras : hFrente, w = Math.hypot(R.x - L.x, R.z - L.z);
  if (!(h > 0.25 && h < 2.6) || w < 0.3 || w > 4) { if (window.IA_DEBUG) window.IA_DEBUG.rej.push({ nome: m.nome, h: +h.toFixed(2), w: +w.toFixed(2), dist: +dist.toFixed(2) }); return; }
  if (m.grupo === 'assento' && w >= 1.25) Object.assign(m, IA.MOVEIS[23], { cls: 23 }); // assento largo = sofá
  const c = B.clone().addScaledVector(n, -m.prof / 2), rot = Math.atan2(n.x, n.z);
  let d = detectados.find(x => x.cls === m.cls && Math.hypot(x.c.x - c.x, x.c.z - c.z) < 0.75);
  if (!d) { d = { cls: m.cls, nome: m.nome, ic: m.ic, apoio: m.apoio, tipo: m.tipo, c: { x: c.x, z: c.z }, w, h, p: m.prof, rot, n: 0 }; detectados.push(d); }
  const a = 1 / Math.min(d.n + 1, 6); // média móvel: cada novo quadro refina a medida
  d.c.x += (c.x - d.c.x) * a; d.c.z += (c.z - d.c.z) * a; d.w += (w - d.w) * a; d.h += (h - d.h) * a; d.n++;
}
function rotuloMovel(txt) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 110; const c = cv.getContext('2d');
  c.fillStyle = 'rgba(15,23,42,.85)'; c.beginPath(); c.roundRect(4, 4, 504, 102, 50); c.fill(); c.strokeStyle = '#facc15'; c.lineWidth = 6; c.stroke();
  c.fillStyle = '#fff'; c.font = '700 44px -apple-system, Segoe UI, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, 256, 57);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, sizeAttenuation: false })); s.scale.set(0.3, 0.065, 1); // mesmo tamanho na tela, perto ou longe s.renderOrder = 15; return s;
}
function mostrarDetectados(g) {
  const ok = detectados.filter(d => d.n >= 2);
  for (const d of ok) {
    if (!d.grupo) {
      d.grupo = new THREE.Group();
      d.caixa = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: '#facc15', transparent: true, opacity: 0.9, depthTest: false }));
      d.grupo.add(d.caixa);
      if (d.apoio) { const t = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#22c55e', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); t.rotation.x = -Math.PI / 2; t.userData.d = d; d.tampo = t; d.grupo.add(t); tampos.push(t); }
      g.add(d.grupo);
      narrar(`🤖 A IA reconheceu: <b>${d.nome}</b> (${fmtM(d.w)} de largura, ${fmtM(d.h)} de altura)${d.apoio ? '. Escolha um <b>enfeite</b> e toque em cima dele: o objeto fica apoiado no tampo.' : '.'}`, 'mv-' + d.cls);
    }
    d.grupo.position.set(d.c.x, 0, d.c.z); d.grupo.rotation.y = d.rot;
    d.caixa.scale.set(d.w, d.h, d.p); d.caixa.position.y = d.h / 2;
    if (d.tampo) { d.tampo.scale.set(d.w * 0.96, d.p * 0.96, 1); d.tampo.position.y = d.h + 0.004; }
    const txt = `${d.ic} ${d.nome} · ${fmtM(d.w)}`;
    if (d.txt !== txt) { if (d.rotulo) d.grupo.remove(d.rotulo); d.rotulo = rotuloMovel(txt); d.grupo.add(d.rotulo); d.txt = txt; }
    d.rotulo.position.y = d.h + (d.apoio ? 0.55 : 0.18); // acima do enfeite que vai no tampo
  }
  $('btnIA').textContent = `🤖 ${ok.length}`;
}
const fmtM = v => v.toFixed(2).replace('.', ',') + ' m';

// 🎬 gravar vídeo com narração (câmera + objetos 3D + a voz)
criarGravador({ nome: 'decora-ra', botaoEm: $('topo'), compor(g, W2, H2) {
  if (estado.modo !== 'giro' || video.readyState >= 2) cobrir(g, video, W2, H2);
  g.drawImage($('gl'), 0, 0, W2, H2);
  g.font = `800 ${W2 / 26}px -apple-system, Segoe UI, Arial`; g.fillStyle = 'rgba(255,255,255,.85)'; g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 6; g.fillText('🛋️ Decora RA', W2 * 0.04, H2 * 0.05); g.shadowBlur = 0;
} });

// para os testes automáticos
window.LIVRE = { estado, planos, itens, armar: t => { estado.armado = t; ui(); }, modoRapido, colocarNaMira, girar, girarDe, previa: () => previa, detectados, ligarIA, camera, anel: () => anel.visible, testeAnel(x, y) { raio({ clientX: x, clientY: y }); return { hits: ray.intersectObjects([anelAro, anelPega], false).length, pega: anelPega.getWorldPosition(new THREE.Vector3()).toArray().map(v => +v.toFixed(2)), cam: camera.position.toArray(), sel: !!estado.sel, R: anelAro.scale.x }; } };
