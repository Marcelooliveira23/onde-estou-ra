/*
 * MAPEAR A CASA: planta baixa em Realidade Aumentada, sem placa.
 *
 * Como mede sem LiDAR (o Safari não dá acesso a ele): TRIGONOMETRIA.
 *   O celular está a uma altura h conhecida (≈ 1,40 m, peito). O giroscópio diz para onde a câmera
 *   aponta. O ponto do chão no centro da mira fica a  d = h / tan(ângulo abaixo do horizonte).
 *   Com a direção (bússola do giroscópio) + a distância, cada canto vira um ponto (x, z) da planta.
 *
 * Fluxo de cada cômodo:
 *   1. fique no meio e dê uma volta de 360° (o anel mostra quanto da volta já foi feito);
 *   2. mire os cantos do chão (📍), as portas (🚪), janelas (🪟) e passagens (↔️);
 *   3. ✅ Concluir: o app "esquadreja" as paredes (ângulos de 90°), encaixa portas e janelas
 *      nas paredes e procura janelas pela CLARIDADE (pontos mais claros da volta = sugestão de janela);
 *   4. escolha a porta por onde vai sair. No próximo cômodo, mire a porta por onde entrou:
 *      a porta é a mesma nos dois cômodos, então o novo cômodo é EMENDADO na planta (posição e giro).
 * A planta aparece AO VIVO no canto da tela e, no fim, vira planta 2D com medidas e maquete 3D.
 * 🤖 IA (opcional): uma rede neural de segmentação (SegFormer, ADE20K) roda no celular e acha SOZINHA
 * a linha onde a parede encontra o chão; com a volta de 360°, os pontos viram as paredes do cômodo.
 * Extras: 📐 altura do teto (olhando PARA CIMA: altura = h + d·tan α), 📏 calibração com a trena
 * (toque numa parede da planta) e 🧮 lista de materiais (piso, rodapé e tinta).
 * No PC (sem giroscópio): arraste a tela para olhar em volta. Testes: window.MAPA.
 */
import * as THREE from 'three';
import { OrbitControls } from '../lib/jsm/controls/OrbitControls.js';
import { criarGravador, cobrir, noLugar, balao } from './gravador.js';
import { narrar, ancorarAcima } from './narrador.js';

const $ = id => document.getElementById(id);
const PARAM = new URLSearchParams(location.search);
const VIDEO_TESTE = PARAM.get('video');
const FOV_LADO_CURTO = 41;           // campo de visão (graus) do lado curto do vídeo 16:9 da câmera traseira
const CHAVE = 'decora-planta-v1';
const LARG = { porta: 0.8, janela: 1.2, passagem: 1.0 };          // larguras típicas (m)
const ICONE = { porta: '🚪', janela: '🪟', passagem: '↔️' };
const NOME = { porta: 'Porta', janela: 'Janela', passagem: 'Passagem' };
const COR_AB = { porta: '#f97316', janela: '#0ea5e9', passagem: '#a855f7' };
const CORES = ['#fde68a', '#bfdbfe', '#bbf7d0', '#fbcfe8', '#ddd6fe', '#fed7aa', '#a5f3fc', '#e9d5ff'];
const NOMES = ['Sala', 'Cozinha', 'Quarto', 'Banheiro', 'Corredor', 'Escritório', 'Lavanderia', 'Varanda'];
const PE_DIREITO = 2.6, ALT_PORTA = 2.1, PEITORIL = 1.0, ALT_JANELA = 2.1, ESP = 0.1;
const RENDE_TINTA = 10;               // m² por litro, por demão (tinta acrílica, estimativa)
const SESSAO = Math.random().toString(36).slice(2, 8);
const d2r = Math.PI / 180, r2d = 180 / Math.PI;
const fmt = (v, c = 2) => v.toFixed(c).replace('.', ',');
const dpr = Math.min(devicePixelRatio || 1, 2);

// ---------- dados da casa (salvos no celular) ----------
function carregar() {
  try { const c = JSON.parse(localStorage.getItem(CHAVE)); if (c && Array.isArray(c.comodos)) return c; } catch (e) { /* sem dados */ }
  return null;
}
let casa = carregar() || { h: 1.4, comodos: [] };
function salvar() { try { localStorage.setItem(CHAVE, JSON.stringify(casa)); } catch (e) { /* modo privado */ } }
const achar = id => casa.comodos.find(c => c.id === id);
const novoId = () => Math.random().toString(36).slice(2, 9);

const estado = {
  etapa: 'capa', atual: null, ligacao: null, mira: null, dir: new THREE.Vector3(0, 0, -1),
  bins: new Array(36).fill(false), luz: new Array(36).fill(0), pilha: [], voltaOk: false,
  pc: false, yaw: 0, pitch: -30, giro: 0, sujo: true, hist: [],
};
const peDe = cm => cm.pe || casa.pe || PE_DIREITO; // pé-direito medido (📐) ou o padrão

// ---------- geometria 2D da planta (x, z em metros) ----------
const sub = (a, b) => ({ x: a.x - b.x, z: a.z - b.z });
const add = (a, b) => ({ x: a.x + b.x, z: a.z + b.z });
const mul = (a, k) => ({ x: a.x * k, z: a.z * k });
const dot = (a, b) => a.x * b.x + a.z * b.z;
const cross = (a, b) => a.x * b.z - a.z * b.x;
const comp = a => Math.hypot(a.x, a.z);
const dist = (a, b) => comp(sub(a, b));
// mesma rotação do three.js em torno do eixo Y (ângulo atan2(z, x) diminui de d)
function rot2(p, d, c) {
  const x = p.x - c.x, z = p.z - c.z, co = Math.cos(d), s = Math.sin(d);
  return { x: c.x + x * co + z * s, z: c.z - x * s + z * co };
}
function areaAss(c) { let s = 0; for (let i = 0; i < c.length; i++) { const j = (i + 1) % c.length; s += c[i].x * c[j].z - c[j].x * c[i].z; } return s / 2; }
const area = c => Math.abs(areaAss(c));
function centro(c) {
  const A = areaAss(c);
  if (Math.abs(A) < 1e-6) return mul(c.reduce(add, { x: 0, z: 0 }), 1 / c.length);
  let x = 0, z = 0;
  for (let i = 0; i < c.length; i++) { const j = (i + 1) % c.length, k = c[i].x * c[j].z - c[j].x * c[i].z; x += (c[i].x + c[j].x) * k; z += (c[i].z + c[j].z) * k; }
  return { x: x / (6 * A), z: z / (6 * A) };
}
function parede(cm, i) { // parede i: do canto i ao i+1, com direção u e normal n (para dentro do cômodo)
  const n = cm.cantos.length, a = cm.cantos[i], b = cm.cantos[(i + 1) % n], L = dist(a, b) || 1e-6;
  const u = mul(sub(b, a), 1 / L), s = areaAss(cm.cantos) > 0 ? 1 : -1;
  return { a, b, L, u, n: { x: -u.z * s, z: u.x * s } };
}
function naParede(cantos, p, fechado = true) { // parede mais próxima de p
  let melhor = null; const n = cantos.length, m = fechado ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const a = cantos[i], b = cantos[(i + 1) % n], e = sub(b, a), L2 = dot(e, e) || 1e-9;
    const t = Math.max(0, Math.min(1, dot(sub(p, a), e) / L2)), q = add(a, mul(e, t)), d = dist(p, q);
    if (!melhor || d < melhor.d) melhor = { i, t, q, d, L: Math.sqrt(L2) };
  }
  return melhor;
}
function simplificar(c) { // tira cantos quase alinhados (marcados no meio de uma parede) ou repetidos
  const r = c.slice(); let mudou = true;
  while (mudou && r.length > 3) {
    mudou = false;
    for (let i = 0; i < r.length; i++) {
      const n = r.length, a = r[(i - 1 + n) % n], b = r[i], d = r[(i + 1) % n], u = sub(b, a), v = sub(d, b);
      if (comp(u) < 0.25 || Math.abs(Math.atan2(cross(u, v), dot(u, v))) < 12 * d2r) { r.splice(i, 1); mudou = true; break; }
    }
  }
  return r;
}
function anguloDominante(c) { // direção principal das paredes (módulo 90°), ponderada pelo comprimento
  let sx = 0, sy = 0;
  for (let i = 0; i < c.length; i++) { const u = sub(c[(i + 1) % c.length], c[i]), L = comp(u), th = Math.atan2(u.z, u.x); sx += L * Math.cos(4 * th); sy += L * Math.sin(4 * th); }
  return Math.atan2(sy, sx) / 4;
}
// "Esquadrejar": casas têm cantos de 90°. Cada parede vira a reta mais próxima a 0°/90° da direção
// principal, passando pelo meio da parede medida; os novos cantos são os cruzamentos dessas retas.
function esquadrejar(c0) {
  const c = simplificar(c0), n = c.length; if (n < 3) return c0;
  const dom = anguloDominante(c), Q = Math.PI / 2, linhas = [];
  for (let i = 0; i < n; i++) {
    const u = sub(c[(i + 1) % n], c[i]), th = Math.atan2(u.z, u.x), k = Math.round((th - dom) / Q);
    if (Math.abs(th - dom - k * Q) > 15 * d2r) return c; // cômodo com parede inclinada: mantém como medido
    const ang = dom + k * Q;
    linhas.push({ p: mul(add(c[i], c[(i + 1) % n]), 0.5), u: { x: Math.cos(ang), z: Math.sin(ang) } });
  }
  const r = [];
  for (let i = 0; i < n; i++) {
    const A = linhas[(i - 1 + n) % n], B = linhas[i], den = cross(A.u, B.u);
    if (Math.abs(den) < 0.5) return c;
    r.push(add(A.p, mul(A.u, cross(sub(B.p, A.p), B.u) / den)));
  }
  return r;
}
function raioNaPlanta(cantos, o, dir) { // primeira parede atingida por um raio saindo de o
  let melhor = null;
  for (let i = 0; i < cantos.length; i++) {
    const a = cantos[i], e = sub(cantos[(i + 1) % cantos.length], a), den = cross(dir, e);
    if (Math.abs(den) < 1e-9) continue;
    const s = cross(sub(a, o), e) / den, t = cross(sub(a, o), dir) / den;
    if (s > 0.2 && t >= 0 && t <= 1 && (!melhor || s < melhor.s)) melhor = { s, p: add(o, mul(dir, s)) };
  }
  return melhor;
}

// ---------- orientação do celular (giroscópio) ----------
let orient = null;
function ouvirOrientacao() {
  addEventListener('deviceorientation', e => { if (e.beta != null) { orient = { a: e.alpha || 0, b: e.beta, g: e.gamma }; estado.pc = false; } });
}

// ---------- três.js: desenho em RA por cima da câmera ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, alpha: true, preserveDrawingBuffer: true }); // preserve: gravação
renderer.setPixelRatio(dpr);
const cena = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 100);
const grupoAR = new THREE.Group(); cena.add(grupoAR);
const matCor = {};
const mat = (cor, op = 1) => matCor[cor + op] || (matCor[cor + op] = new THREE.MeshBasicMaterial({ color: cor, transparent: op < 1, opacity: op, depthWrite: op === 1, side: THREE.DoubleSide }));
const retic = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.1, 40), mat('#ffffff', 0.9)); retic.rotation.x = -Math.PI / 2; cena.add(retic);
const elastico = new THREE.Mesh(new THREE.BoxGeometry(1, 0.006, 0.03), mat('#facc15')); cena.add(elastico);

const eulerGiro = new THREE.Euler(), qTela = new THREE.Quaternion(), qAjuste = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const qBruto = new THREE.Quaternion(), qY = new THREE.Quaternion(), EIXO_Y = new THREE.Vector3(0, 1, 0), EIXO_Z = new THREE.Vector3(0, 0, 1);
function atualizarCamera() {
  if (orient && !estado.pc) { // mesma conta do DeviceOrientationControls do three.js
    const tela = ((screen.orientation && screen.orientation.angle) || 0) * d2r;
    eulerGiro.set(orient.b * d2r, orient.a * d2r, -orient.g * d2r, 'YXZ');
    camera.quaternion.setFromEuler(eulerGiro).multiply(qAjuste).multiply(qTela.setFromAxisAngle(EIXO_Z, -tela));
  } else {
    eulerGiro.set(estado.pitch * d2r, estado.yaw * d2r, 0, 'YXZ');
    camera.quaternion.setFromEuler(eulerGiro);
  }
  qBruto.copy(camera.quaternion); // orientação "real" do celular (usada pelo simulador)
  camera.quaternion.premultiply(qY.setFromAxisAngle(EIXO_Y, estado.giro)); // correção de giro (emenda dos cômodos)
  const o = origemAtual();
  camera.position.set(o.x, casa.h, o.z);
}
const origemAtual = () => (estado.atual ? estado.atual.origem : { x: 0, z: 0 });

function calcularMira() { // o ponto do chão no centro da tela: d = h / tan(ângulo abaixo do horizonte)
  const d = estado.dir.set(0, 0, -1).applyQuaternion(camera.quaternion), o = origemAtual();
  estado.mira = null;
  if (d.y < -0.07) {
    const s = casa.h / -d.y, hx = d.x * s, hz = d.z * s, dh = Math.hypot(hx, hz);
    if (dh < 12) estado.mira = { x: o.x + hx, z: o.z + hz, d: dh };
  }
}

function limparAR() {
  grupoAR.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  grupoAR.clear();
}
function pino(p, cor, alt = 0.35) {
  const g = new THREE.Group();
  const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, alt, 8), mat(cor)); haste.position.y = alt / 2;
  const bola = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), mat(cor)); bola.position.y = alt;
  g.add(haste, bola); g.position.set(p.x, 0, p.z); return g;
}
function faixa(m, a, b) { // fita no chão de a até b
  m.scale.x = Math.max(0.001, dist(a, b));
  m.position.set((a.x + b.x) / 2, 0.004, (a.z + b.z) / 2);
  m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
  return m;
}
function montarAR() { // o que já foi marcado aparece "desenhado" no cômodo real
  limparAR();
  const cm = estado.atual; if (!cm) return;
  const n = cm.cantos.length;
  cm.cantos.forEach(p => grupoAR.add(pino(p, '#22c55e')));
  for (let i = 0; i < (cm.fechado ? n : n - 1); i++)
    grupoAR.add(faixa(new THREE.Mesh(new THREE.BoxGeometry(1, 0.006, 0.035), mat('#22c55e')), cm.cantos[i], cm.cantos[(i + 1) % n]));
  if (!cm.fechado) { cm.aberturas.forEach(a => grupoAR.add(pino(a.p, COR_AB[a.tipo], 0.25))); return; }
  for (let i = 0; i < n; i++) { // paredes virtuais translúcidas sobre as paredes reais
    const w = parede(cm, i);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(w.L, peDe(cm)), mat('#ffffff', 0.13));
    pl.position.set((w.a.x + w.b.x) / 2, peDe(cm) / 2, (w.a.z + w.b.z) / 2); pl.rotation.y = -Math.atan2(w.u.z, w.u.x);
    grupoAR.add(pl);
  }
  for (const a of cm.aberturas) { // molduras coloridas das portas e janelas
    const w = parede(cm, a.parede), y0 = a.tipo === 'janela' ? PEITORIL : 0, y1 = a.tipo === 'janela' ? ALT_JANELA : ALT_PORTA;
    const g = new THREE.Group();
    const fundo = new THREE.Mesh(new THREE.PlaneGeometry(a.larg, y1 - y0), mat(COR_AB[a.tipo], 0.3)); fundo.position.y = (y0 + y1) / 2; g.add(fundo);
    const h = a.larg / 2, borda = [[-h, y0], [h, y0], [h, y1], [-h, y1], [-h, y0]].map(([x, y]) => new THREE.Vector3(x, y, 0));
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(borda), new THREE.LineBasicMaterial({ color: COR_AB[a.tipo] })));
    g.position.set(a.p.x + w.n.x * 0.02, 0, a.p.z + w.n.z * 0.02); g.rotation.y = -Math.atan2(w.u.z, w.u.x);
    grupoAR.add(g);
  }
}
function atualizarRetic() {
  const m = estado.mira, cm = estado.atual;
  retic.visible = !!m;
  if (m) { retic.position.set(m.x, 0.006, m.z); retic.material = mat(estado.etapa === 'cantos' || estado.etapa === 'entrada' ? '#4ade80' : '#ffffff', 0.9); }
  const elas = m && cm && estado.etapa === 'cantos' && cm.cantos.length && !cm.fechado;
  elastico.visible = !!elas;
  if (elas) faixa(elastico, cm.cantos[cm.cantos.length - 1], m);
}

// ---------- câmera ----------
const video = $('video');
// ?sim=vr: a "câmera" é a casa de exemplo em 3D (vr.html) vista da mesma pose do celular (teste e demonstração no PC)
let simVR = null; const SIM_POS = (PARAM.get('pos') || '2.3,1.8').split(',').map(Number);
async function abrirCamera() {
  if (PARAM.get('sim') === 'vr') {
    const fr = document.createElement('iframe'); fr.src = 'vr.html?exemplo&modo=andar&sim=1';
    fr.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;border:0;z-index:-1'; document.body.prepend(fr);
    await new Promise(ok => { const t = setInterval(() => { if (fr.contentWindow && fr.contentWindow.VR) { clearInterval(t); ok(); } }, 100); });
    simVR = { fr, x: SIM_POS[0], z: SIM_POS[1] };
    video.srcObject = fr.contentDocument.getElementById('vr').captureStream(30);
  } else if (VIDEO_TESTE) { video.src = VIDEO_TESTE; video.loop = true; }
  else video.srcObject = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } });
  await new Promise(ok => { if (video.readyState >= 1) ok(); else video.onloadedmetadata = ok; });
  await video.play();
}
function ajustarTela() {
  const W = innerWidth, H = innerHeight;
  renderer.setSize(W, H, false);
  const vw = video.videoWidth || 720, vh = video.videoHeight || 1280, s = Math.max(W / vw, H / vh);
  const f = (Math.min(vw, vh) * s / 2) / Math.tan(FOV_LADO_CURTO * d2r / 2); // distância focal em px da tela
  camera.fov = 2 * Math.atan((H / 2) / f) * r2d; camera.aspect = W / H; camera.updateProjectionMatrix();
  const mini = $('mini'); mini.width = mini.clientWidth * dpr; mini.height = mini.clientHeight * dpr;
  lupa.width = lupa.height = Math.round(96 * dpr); // tamanho fixo (escondida, clientWidth é 0)
}
addEventListener('resize', () => { if (estado.etapa !== 'capa') ajustarTela(); });

async function iniciar() {
  $('capa').hidden = true; $('planta').hidden = true; $('carregando').hidden = false;
  try { // iOS: o pedido do giroscópio tem que acontecer dentro do toque
    if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) {
      if (await DeviceOrientationEvent.requestPermission() === 'granted') ouvirOrientacao();
    } else ouvirOrientacao();
  } catch (e) { /* sem giroscópio: modo PC */ }
  try { await abrirCamera(); } catch (e) {
    $('carregando').innerHTML = '<p>❌ Não foi possível abrir a câmera.<br>No iPhone: Ajustes › Apps › Safari › Câmera › Permitir, e use o endereço <b>https://</b>.</p>';
    return;
  }
  $('carregando').hidden = true; $('hud').hidden = false;
  ajustarTela();
  if ($('chkIA').checked) ligarIA();
  ancorarAcima(() => ($('planta').hidden ? $('barra') : $('resumo')));
  narrar('<b>Mapear a casa:</b> o app mede com <b>trigonometria</b>. Sabendo a altura do celular e o ângulo da mira, a distância até o chão é <b>altura ÷ tangente do ângulo</b>.');
  estado.etapa = casa.comodos.length ? 'resumo' : 'nome';
  ui(); requestAnimationFrame(quadro);
  setTimeout(() => { if (!orient) { estado.pc = true; aviso('🖱️ Sem giroscópio (PC): <small>arraste a tela para olhar em volta</small>', '#475569'); } }, 1500);
}

// ---------- laço principal ----------
let tMini = 0, tLuz = 0;
function quadro(t) {
  requestAnimationFrame(quadro);
  atualizarCamera(); calcularMira();
  if (simVR) { const q = qBruto; simVR.fr.contentWindow.VR.pose(simVR.x, casa.h, simVR.z, [q.x, q.y, q.z, q.w], camera.fov); }
  if (estado.etapa === 'cantos' && IA) cicloIA(t);
  if (estado.mira) { const h = estado.hist; h.push({ x: estado.mira.x, z: estado.mira.z, t }); if (h.length > 40) h.shift(); }
  if (estado.etapa === 'cantos') registrarVolta(t);
  if (estado.sujo) { montarAR(); estado.sujo = false; }
  atualizarRetic();
  renderer.render(cena, camera);
  if (t - tMini > 70) { tMini = t; desenharMini(); textoMira(); }
  desenharLupa();
}
// 🔍 lupa: o centro da imagem ampliado 3x, ao lado da mira (para acertar o canto exato)
const lupa = $('lupa'), lupaG = lupa.getContext('2d');
function desenharLupa() {
  const mostrar = ['cantos', 'entrada', 'porta'].includes(estado.etapa) && !!estado.mira && video.readyState >= 2 && !simVR;
  lupa.hidden = !mostrar; if (!mostrar) return;
  const W = innerWidth, H = innerHeight, vw = video.videoWidth, vh = video.videoHeight, s = Math.max(W / vw, H / vh), N = lupa.width;
  const lado = N / dpr / 3 / s; // pedaço do vídeo que cabe na lupa com zoom 3x
  lupaG.save(); lupaG.beginPath(); lupaG.arc(N / 2, N / 2, N / 2, 0, 7); lupaG.clip();
  lupaG.drawImage(video, vw / 2 - lado / 2, vh / 2 - lado / 2, lado, lado, 0, 0, N, N);
  lupaG.strokeStyle = '#4ade80'; lupaG.lineWidth = 2 * dpr; lupaG.beginPath(); lupaG.moveTo(N / 2, 0); lupaG.lineTo(N / 2, N); lupaG.moveTo(0, N / 2); lupaG.lineTo(N, N / 2); lupaG.stroke();
  lupaG.restore();
}
function binDe(d) { const yaw = Math.atan2(-d.x, -d.z); return Math.floor(((yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * 36) % 36; }
const luzCv = document.createElement('canvas'); luzCv.width = 16; luzCv.height = 28;
const luzG = luzCv.getContext('2d', { willReadFrequently: true });
function registrarVolta(t) { // anel de 360° + claridade em cada direção (para achar janelas)
  const d = estado.dir; if (d.y < -0.97) return;
  const b = binDe(d); estado.bins[b] = true;
  if (t - tLuz > 250 && video.readyState >= 2) {
    tLuz = t;
    try {
      luzG.drawImage(video, 0, 0, 16, 28);
      const px = luzG.getImageData(0, 0, 16, 11).data; let s = 0;
      for (let i = 0; i < px.length; i += 4) s += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      estado.luz[b] = Math.max(estado.luz[b], s / (px.length / 4));
    } catch (e) { /* vídeo ainda sem quadro */ }
  }
  const v = volta();
  $('voltaArco').setAttribute('stroke-dasharray', `${(v * 169.6).toFixed(1)} 170`);
  $('voltaTxt').textContent = Math.round(v * 100) + '%';
  if ((v >= 0.9) !== estado.voltaOk) { estado.voltaOk = v >= 0.9; ui(); }
}
const volta = () => estado.bins.filter(Boolean).length / 36;
function textoMira() {
  const m = estado.mira, cm = estado.atual, el = $('miraTxt');
  if (estado.etapa === 'teto') {
    const r = alturaTeto(); $('mira').classList.toggle('ok', !!r);
    el.innerHTML = r ? `📐 teto a ${fmt(r.pe)} m <small>· parede a ${fmt(r.s)} m</small>` : 'levante o celular: mire onde a parede encontra o teto';
    return;
  }
  $('mira').classList.toggle('ok', !!m);
  if (!m) { el.innerHTML = 'incline o celular para o chão'; return; }
  let t = `📏 ${fmt(m.d)} m`;
  if (estado.etapa === 'cantos' && cm && cm.cantos.length && !cm.fechado) t += ` <small>· parede ${fmt(dist(cm.cantos[cm.cantos.length - 1], m))} m</small>`;
  el.innerHTML = t;
}

// ---------- ações ----------
function aviso(html, cor) {
  const a = $('aviso'); a.innerHTML = html; a.style.setProperty('--cor', cor || '#16a34a');
  a.hidden = false; a.classList.remove('entra'); void a.offsetWidth; a.classList.add('entra');
  clearTimeout(aviso.t); aviso.t = setTimeout(() => { a.hidden = true; }, 2600);
}
function pop() { const m = $('mira'); m.classList.remove('pop'); void m.offsetWidth; m.classList.add('pop'); }
function sujar() { estado.sujo = true; }
// Mira estável: média das miras dos últimos 0,35 s que estão perto da atual (tira a tremida da mão)
function miraEstavel() {
  const m = estado.mira; if (!m) return null;
  const agora = performance.now(), ok = estado.hist.filter(p => agora - p.t < 350 && dist(p, m) < 0.15);
  if (ok.length < 2) return m;
  const s = ok.reduce((a, p) => add(a, p), { x: 0, z: 0 }), r = mul(s, 1 / ok.length);
  return { x: r.x, z: r.z, d: dist(r, origemAtual()) };
}
// Altura do teto: a parede está a s metros (pela planta já medida); olhando PARA CIMA num ângulo α,
// a linha parede/teto está a h + s·tan α do chão. É a mesma trigonometria da medida do chão, invertida.
function alturaTeto() {
  const d = estado.dir, cm = estado.atual; if (!cm || !cm.fechado || d.y < 0.03) return null;
  const hz = Math.hypot(d.x, d.z); if (hz < 0.1) return null;
  const hit = raioNaPlanta(cm.cantos, cm.origem, { x: d.x / hz, z: d.z / hz }); if (!hit) return null;
  const pe = casa.h + hit.s * d.y / hz;
  return pe > 1.8 && pe < 6 ? { pe, s: hit.s } : null;
}
function medirTeto() {
  const r = alturaTeto(), cm = estado.atual;
  if (!r) return aviso('Mire a <b>linha onde a parede encontra o teto</b>', '#b45309');
  cm.pe = casa.pe = Math.round(r.pe * 100) / 100;
  estado.etapa = 'resumo'; pop(); salvar(); sujar(); ui();
  aviso(`📐 Pé-direito do(a) ${cm.nome}: ${fmt(cm.pe)} m<small>a maquete 3D e os materiais usam esta altura</small>`, '#7c3aed');
  narrar(`Pé-direito: <b>${fmt(cm.pe)} m</b>. Olhando para cima, o teto fica a altura do celular + distância da parede × tangente do ângulo.`);
}
// Calibração: o usuário mede UMA parede com a trena; a casa inteira (e a altura do celular) é corrigida na mesma proporção
function escalar(k) {
  const m = p => ({ x: p.x * k, z: p.z * k });
  for (const c of casa.comodos) { c.cantos = c.cantos.map(m); c.origem = m(c.origem); c.aberturas.forEach(a => { a.p = m(a.p); }); if (c.pe) c.pe *= k; }
  if (casa.pe) casa.pe *= k;
  casa.h *= k; casa.calibrado = true; estado.hist = []; salvar(); sujar();
}
function calibrar(cm, i) {
  const L = parede(cm, i).L;
  const r = prompt(`📏 Parede do(a) ${cm.nome}: o app mediu ${fmt(L)} m.\nQuanto ela mede com a TRENA? (em metros, ex.: 3,85)`, fmt(L));
  if (r == null || !r.trim()) return;
  const real = parseFloat(r.replace(',', '.'));
  if (!(real > 0.3) || real / L > 1.6 || real / L < 0.6) { notaPlanta = '⚠️ Medida não aceita: digite em metros, perto do valor medido (ex.: 3,85).'; return abrirPlanta(); }
  const k = real / L; escalar(k);
  notaPlanta = `📏 Calibrada com a trena: tudo foi corrigido em ${k >= 1 ? '+' : ''}${fmt((k - 1) * 100, 1)}% · altura do celular agora ${fmt(casa.h)} m`;
  abrirPlanta();
}
function zerarVolta() { estado.bins.fill(false); estado.luz.fill(0); estado.pilha = []; estado.voltaOk = false; zerarIA(); }

// ---------- 🤖 IA: a parede é achada sozinha ----------
// A cada ~0,3 s a imagem vai para a rede neural. Em cada coluna, o rodapé (parede com chão logo abaixo)
// vira um raio que sai da câmera; onde o raio cruza o chão (altura h) está um ponto da parede: a mesma
// trigonometria da mira, só que para dezenas de pontos por quadro, sem tocar em nada.
let IA = null, iaOcupada = false, tIA = 0, verIA = true, iaAuto = false;
const ia = { bins: Array.from({ length: 180 }, () => []), n: 0, poli: null, ms: 0 };
const camFoto = new THREE.PerspectiveCamera(), v3 = new THREE.Vector3();
const iaCv = $('iaMapa'), iaCtx = iaCv.getContext('2d');
function zerarIA() { ia.bins.forEach(b => { b.length = 0; }); ia.n = 0; ia.poli = null; iaAuto = false; iaCtx.clearRect(0, 0, iaCv.width, iaCv.height); }
async function ligarIA() {
  const chip = $('iaChip'); chip.hidden = false; chip.textContent = '🤖 Baixando a IA…';
  try {
    IA = await import('./ia_paredes.js');
    const vistos = {};
    await IA.carregar(p => { if (p.status === 'progress' && p.total) { vistos[p.file] = [p.loaded, p.total]; const v = Object.values(vistos), a = v.reduce((s, x) => s + x[0], 0), b = v.reduce((s, x) => s + x[1], 0); chip.textContent = `🤖 Baixando a IA… ${Math.round(a / b * 100)}%`; } });
    chip.textContent = '🤖 IA pronta'; ui();
    narrar('A <b>inteligência artificial</b> está ligada: uma rede neural (SegFormer) roda aqui no celular e pinta cada pixel como <b>parede, chão, porta ou janela</b>.');
    aviso(`🤖 IA ligada <small>roda no celular: ${IA.dispositivo}</small>`, '#7c3aed');
  } catch (e) { IA = null; chip.textContent = '🤖 IA indisponível · modo manual'; console.warn(e); }
}
const qAntes = []; // orientações recentes: girando rápido, a imagem chega "atrasada" e a medida sai torta
async function cicloIA(t) {
  qAntes.push({ q: camera.quaternion.clone(), t }); while (qAntes.length > 2 && t - qAntes[1].t > 160) qAntes.shift();
  if (!IA.pronto() || iaOcupada || t - tIA < 300 || video.readyState < 2 || estado.dir.y > -0.08 || estado.dir.y < -0.88) return;
  if (!simVR && qAntes.length > 1 && qAntes[0].q.angleTo(camera.quaternion) > 5 * d2r) return; // > ~30°/s: espera ficar mais parado
  iaOcupada = true; tIA = t;
  camFoto.copy(camera); camFoto.updateMatrixWorld();
  const cm = estado.atual, o = { ...origemAtual() };
  try {
    let fonte = video, vw = video.videoWidth, vh = video.videoHeight;
    if (simVR) { const q = qBruto; fonte = simVR.fr.contentWindow.VR.pose(simVR.x, casa.h, simVR.z, [q.x, q.y, q.z, q.w], camera.fov, true); vw = fonte.width; vh = fonte.height; }
    const W = innerWidth, H = innerHeight, s = Math.max(W / vw, H / vh), sw = W / s, sh = H / s;
    const r = await IA.segmentar(fonte, (vw - sw) / 2, (vh - sh) / 2, sw, sh);
    if (estado.etapa !== 'cantos' || estado.atual !== cm) return;
    ia.ms = r.ms;
    for (const p of IA.rodapes(r, 64)) {
      if (Math.abs(p.u - 0.5) > 0.44) continue; // bordas da imagem: a lente distorce mais
      v3.set(p.u * 2 - 1, 1 - p.v * 2, 0.5).unproject(camFoto).sub(camFoto.position).normalize();
      if (v3.y > -0.16) continue; // raio quase na horizontal (< 9°): um errinho de ângulo vira muitos centímetros
      const k = casa.h / -v3.y, x = v3.x * k, z = v3.z * k, d = Math.hypot(x, z);
      if (d < 0.4 || d > 6.5) continue;
      const bin = ia.bins[Math.floor(((Math.atan2(z, x) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * 180) % 180];
      bin.push({ x: o.x + x, z: o.z + z, d, tipo: p.tipo }); if (bin.length > 15) bin.shift();
      ia.n++;
    }
    const antes = ia.poli && ia.poli.cantos.length;
    ia.poli = poligonoIA(cm);
    if (verIA) { iaCv.width = 96; iaCv.height = Math.round(96 * H / W); IA.pintarMapa(r, iaCtx, iaCv.width, iaCv.height); }
    $('iaChip').textContent = `🤖 ${ia.n} pontos${ia.poli ? ` · ${ia.poli.cantos.length} paredes` : ''} · ${Math.round(r.ms)} ms`;
    if ((ia.poli && ia.poli.cantos.length) !== antes) ui();
    if (!iaAuto && cm.cantos.length === 0 && volta() >= 0.95 && ia.poli && ia.poli.cantos.length >= 4 && ia.poli.cheios >= 60) {
      iaAuto = true; aviso('🤖 Volta completa: <b>a IA fechou a planta</b>', '#7c3aed'); narrar('Volta completa: com os rodapés achados pela IA em todas as direções, o app encontrou as <b>4 paredes</b> sozinho, sem nenhum toque.'); setTimeout(() => { if (estado.etapa === 'cantos' && estado.atual === cm) concluir(); }, 700);
    }
  } catch (e) { console.warn(e); } finally { iaOcupada = false; }
}
function distSeg(p, a, b) { const e = sub(b, a), L2 = dot(e, e) || 1e-9, t = Math.max(0, Math.min(1, dot(sub(p, a), e) / L2)); return dist(p, add(a, mul(e, t))); }
// Casas têm paredes retas e em ângulo reto. Em cada um dos 4 lados, a parede é a reta onde MUITAS
// direções da volta concordam; entre as candidatas, a mais LONGE vence, porque móvel fica na frente
// da parede, nunca atrás. Depois, ao longo de cada parede, procura portas, janelas e passagens.
function poligonoIA(cm) {
  const o = cm.origem, rep = [], todos = [];
  for (let b = 0; b < 180; b++) { // 1 ponto por direção (2°): a mediana das medidas
    const L = ia.bins[b]; L.forEach(p => todos.push({ p, b }));
    if (!L.length) { rep.push(null); continue; }
    const m = L.slice().sort((a, c) => a.d - c.d)[L.length >> 1], cont = {};
    L.forEach(p => { cont[p.tipo] = (cont[p.tipo] || 0) + 1; });
    rep.push({ x: m.x, z: m.z, d: m.d, b, tipo: Object.entries(cont).sort((a, c) => c[1] - a[1])[0][0] });
  }
  const cheios = rep.filter(Boolean).length; if (cheios < 30) return null;
  for (const r of rep) if (r) { // muito mais longe que os vizinhos = olhando por uma porta/passagem (o cômodo do lado)
    const viz = []; for (let k = -5; k <= 5; k++) { const q = k && rep[(r.b + k + 180) % 180]; if (q) viz.push(q.d); }
    viz.sort((a, c) => a - c); r.vao = viz.length >= 3 && r.d > viz[viz.length >> 1] + 0.75; // atrás de móvel a parede fica uns 30-60 cm além; por uma porta, bem mais
  }
  const seq = rep.filter(Boolean); let sx = 0, sy = 0; // direção principal das paredes (módulo 90°)
  for (let i = 0; i < seq.length; i++) {
    const u = sub(seq[(i + 1) % seq.length], seq[i]), L = Math.hypot(u.x, u.z); if (L < 0.03 || L > 0.5) continue;
    const th = Math.atan2(u.z, u.x); sx += Math.cos(4 * th) * L; sy += Math.sin(4 * th) * L;
  }
  const dom = Math.atan2(sy, sx) / 4, ex = { x: Math.cos(dom), z: Math.sin(dom) }, ez = { x: -Math.sin(dom), z: Math.cos(dom) };
  const lados = [[ex, 1], [ez, 1], [ex, -1], [ez, -1]], dist4 = [];
  for (const [e, sg] of lados) {
    const vals = [];
    for (const { p, b } of todos) {
      const v = sub(p, o), d = Math.hypot(v.x, v.z), c = dot(v, e) * sg; if (d < 0.3 || c / d < Math.cos(42 * d2r)) continue;
      vals.push({ c, b });
    }
    if (vals.length < 4) return null;
    const apoio = new Map(); // para cada distância (de 5 em 5 cm): quantas DIREÇÕES diferentes têm ponto ali
    for (const { c } of vals) { const k = Math.round(c / 0.05); if (!apoio.has(k)) apoio.set(k, null); }
    let max = 0; const cand = [];
    for (const k of apoio.keys()) {
      const bs = new Set(); for (const v of vals) if (Math.abs(v.c - k * 0.05) < 0.1) bs.add(v.b);
      cand.push({ k, n: bs.size }); max = Math.max(max, bs.size);
    }
    // a parede é a reta MAIS LONGE com apoio; atrás de um móvel ela aparece pouco (até ~60 cm além da frente do
    // móvel), por uma porta aparece o outro cômodo, bem mais longe: esse não conta
    const forte = cand.filter(c => c.n >= Math.max(4, max * 0.35)).sort((a, b) => b.k - a.k)[0];
    const ok = cand.filter(c => c.n >= 3 && (!forte || c.k * 0.05 <= forte.k * 0.05 + 0.6)).sort((a, b) => b.k - a.k)[0];
    if (!ok) { const cs = vals.map(v => v.c).sort((a, b) => a - b); dist4.push(cs[Math.floor(cs.length * 0.8)]); continue; } // parede quase toda escondida: estimativa
    const perto = vals.filter(v => Math.abs(v.c - ok.k * 0.05) < 0.12);
    dist4.push(perto.reduce((s2, v) => s2 + v.c, 0) / perto.length);
  }
  if (dist4.some(d => d < 0.5 || d > 8)) return null;
  const P = (a, b) => add(o, add(mul(ex, a), mul(ez, b)));
  const cantos = [P(dist4[0], dist4[1]), P(-dist4[2], dist4[1]), P(-dist4[2], -dist4[3]), P(dist4[0], -dist4[3])];
  if (areaAss(cantos) < 0) cantos.reverse();
  // ao longo das paredes: o raio de cada direção bate na parede a s metros; ponto bem mais longe = vão (passagem)
  const raioB = b => { const a = (b + 0.5) / 180 * 2 * Math.PI; return raioNaPlanta(cantos, o, { x: Math.cos(a), z: Math.sin(a) }); };
  for (const r of rep) if (r) { const h = raioB(r.b); r.s = h ? h.s : r.d; r.salto = r.d > r.s + 0.45; r.naParede = Math.abs(r.d - r.s) < 0.3; }
  const aberturas = [];
  const trechos = (teste, tipo, min, max) => {
    for (let b = 0; b < 180; b++) {
      const T = i => rep[(i + 180) % 180] && teste(rep[(i + 180) % 180]);
      if (!T(b) || T(b - 1)) continue;
      let e = b; while (T(e + 1) && e - b < 60) e++;
      if (e - b < 1) continue;
      const a0 = raioB(b), a1 = raioB(e); if (!a0 || !a1) continue;
      const larg = dist(a0.p, a1.p) + 0.05; if (larg < min || larg > max) continue;
      aberturas.push({ tipo, p: mul(add(a0.p, a1.p), 0.5), larg: Math.min(larg, tipo === 'porta' ? 1 : larg) });
    }
  };
  trechos(r => r.naParede && r.tipo === 'porta', 'porta', 0.5, 1.6);
  trechos(r => r.naParede && r.tipo === 'janela', 'janela', 0.5, 3);
  trechos(r => r.salto, 'passagem', 0.55, 2.2);
  return { cantos, rep, cheios, aberturas };
}

function novoComodo(nome) {
  const i = casa.comodos.length;
  const cm = { id: novoId(), nome, cor: CORES[i % CORES.length], origem: { x: 0, z: 0 }, cantos: [], aberturas: [], fechado: false, sessao: SESSAO };
  if (estado.ligacao) {
    const A = abertura(estado.ligacao);
    cm.origem = { x: A.p.x, z: A.p.z }; // provisório: ajustado ao mirar a porta
    estado.etapa = 'entrada';
  } else {
    if (i > 0) { const B = limites(casa.comodos.flatMap(c => c.cantos)); cm.origem = { x: B.x1 + 3, z: (B.z0 + B.z1) / 2 }; }
    estado.etapa = 'cantos';
  }
  casa.comodos.push(cm); estado.atual = cm; zerarVolta(); sujar(); ui();
}
function abertura(lig) { const c = achar(lig.c); return c && c.aberturas.find(a => a.id === lig.a); }

function entrei() { // mirou a soleira da porta por onde entrou: posiciona o novo cômodo na planta
  const cm = estado.atual, m = miraEstavel(); if (!m) return aviso('Mire a <b>soleira da porta</b> no chão', '#b45309');
  const lig = estado.ligacao, A = abertura(lig);
  const v = sub(m, cm.origem);
  cm.origem = sub(A.p, v);
  const ab = { id: novoId(), tipo: A.tipo, p: { x: A.p.x, z: A.p.z }, larg: A.larg, entrada: true, liga: { c: lig.c, a: lig.a } };
  cm.aberturas.push(ab); A.liga = { c: cm.id, a: ab.id };
  estado.ligacao = null; estado.etapa = 'cantos'; pop(); sujar(); salvar(); ui();
  aviso(`🔗 ${cm.nome} ligado à planta! <small>agora gire e marque os cantos</small>`, '#2563eb');
  narrar(`Como a porta é <b>o mesmo ponto nos dois cômodos</b>, o(a) ${cm.nome} foi <b>emendado(a)</b> na planta do outro lado da parede.`);
}
function marcarCanto() {
  const m = miraEstavel(); if (!m) return aviso('Incline o celular para <b>o chão</b>', '#b45309');
  if (m.d > 8) return aviso('Longe demais (mais de 8 m). <small>Chegue mais perto do canto</small>', '#b45309');
  estado.atual.cantos.push({ x: m.x, z: m.z }); estado.pilha.push('canto'); pop(); sujar(); ui();
  narrar(`Canto ${estado.atual.cantos.length} marcado a <b>${fmt(m.d)} m</b>: a direção vem do giroscópio e a distância da inclinação do celular.${estado.atual.cantos.length >= 2 ? ` Parede de ${fmt(dist(estado.atual.cantos[estado.atual.cantos.length - 2], m))} m.` : ''}`);
}
function marcarAbertura(tipo) {
  const m = miraEstavel(); if (!m) return aviso('Mire a <b>base</b> da ' + NOME[tipo].toLowerCase() + ', no chão', '#b45309');
  estado.atual.aberturas.push({ id: novoId(), tipo, p: { x: m.x, z: m.z }, larg: LARG[tipo] });
  estado.pilha.push('abertura'); pop(); sujar(); ui();
  aviso(`${ICONE[tipo]} ${NOME[tipo]} marcada`, COR_AB[tipo]);
  narrar(`${NOME[tipo]} marcada: no fim ela é encaixada na parede mais próxima${tipo === 'janela' ? '' : ' e serve para ligar este cômodo ao próximo'}.`);
}
function desfazer() {
  const cm = estado.atual, o = estado.pilha.pop(); if (!o) return;
  if (o === 'canto') cm.cantos.pop();
  else { const i = cm.aberturas.map(a => !a.entrada).lastIndexOf(true); if (i >= 0) cm.aberturas.splice(i, 1); }
  sujar(); ui();
}
function encaixar(cm) { // cada porta/janela vai para a parede mais próxima
  for (const a of cm.aberturas) {
    const r = naParede(cm.cantos, a.p), w = parede(cm, r.i);
    a.larg = Math.min(a.larg, w.L * 0.9);
    const meia = a.larg / 2 / w.L, t = Math.max(meia, Math.min(1 - meia, r.t));
    a.parede = r.i; a.t = t; a.p = add(w.a, mul(w.u, t * w.L));
  }
}
function sugerirJanelas(cm) { // janelas costumam ser os pontos MAIS CLAROS da volta de 360°
  const L = estado.luz, validos = L.filter(v => v > 0).sort((a, b) => a - b);
  if (validos.length < 18) return 0;
  const med = validos[validos.length >> 1], claro = L.map(v => v > Math.max(med * 1.35, med + 28));
  if (claro.every(Boolean)) return 0;
  const ini = claro.findIndex(c => !c), grupos = [];
  for (let k = 0; k < 36;) { // grupos de direções claras seguidas (em círculo)
    const i = (ini + k) % 36; if (!claro[i]) { k++; continue; }
    let j = 0, pico = 0; while (j < 36 && claro[(i + j) % 36]) pico = Math.max(pico, L[(i + j++) % 36]);
    if (j <= 12) grupos.push({ yaw: ((i + (j - 1) / 2 + 0.5) / 36) * 2 * Math.PI, pico }); // janela: até ~120° da volta
    k += j;
  }
  let n = 0;
  for (const gr of grupos.sort((a, b) => b.pico - a.pico).slice(0, 2)) { // no máximo as 2 mais claras
    const dir = { x: -Math.sin(gr.yaw), z: -Math.cos(gr.yaw) };
    const perto = cm.aberturas.some(a => { const v = sub(a.p, cm.origem); return Math.abs(Math.atan2(cross(dir, v), dot(dir, v))) < 25 * d2r; });
    const hit = !perto && raioNaPlanta(cm.cantos, cm.origem, dir);
    if (hit) { cm.aberturas.push({ id: novoId(), tipo: 'janela', p: hit.p, larg: LARG.janela, sugerida: true }); n++; }
  }
  return n;
}
function alinhar(cm) { // emenda: a porta de entrada coincide com a porta do outro cômodo, paredes paralelas
  const ent = cm.aberturas.find(a => a.entrada); if (!ent) return;
  const src = achar(ent.liga.c), A = abertura(ent.liga); if (!src || !A || A.parede == null) return;
  const wa = parede(src, A.parede), wb = parede(cm, ent.parede), PA = A.p, PB = ent.p;
  let d0 = Math.atan2(wb.u.z, wb.u.x) - Math.atan2(wa.u.z, wa.u.x);
  d0 = ((d0 % Math.PI) + Math.PI) % Math.PI; if (d0 > Math.PI / 2) d0 -= Math.PI;
  const ladoA = Math.sign(cross(wa.u, sub(centro(src.cantos), PA))), cB = centro(cm.cantos);
  let melhor = null;
  for (const d of [d0, d0 > 0 ? d0 - Math.PI : d0 + Math.PI]) { // o novo cômodo fica do OUTRO lado da parede
    const lado = Math.sign(cross(wa.u, sub(add(rot2(cB, d, PB), sub(PA, PB)), PA)));
    const custo = (lado !== ladoA ? 0 : 10) + Math.abs(d);
    if (!melhor || custo < melhor.c) melhor = { d, c: custo };
  }
  let d = melhor.d;
  if (cm.sessao === src.sessao && Math.abs(d) > 35 * d2r) d = 0; // mesma sessão: o giroscópio já está certo
  const T = sub(PA, PB), mover = p => add(rot2(p, d, PB), T);
  cm.cantos = cm.cantos.map(mover); cm.aberturas.forEach(a => { a.p = mover(a.p); }); cm.origem = mover(cm.origem);
  estado.giro += d;
}
function endireitar(cm) { // 1º cômodo: paredes alinhadas com a tela (planta "reta")
  let d = anguloDominante(cm.cantos); d = ((d + Math.PI / 4) % (Math.PI / 2) + Math.PI / 2) % (Math.PI / 2) - Math.PI / 4;
  const o = cm.origem, mover = p => rot2(p, d, o);
  cm.cantos = cm.cantos.map(mover); cm.aberturas.forEach(a => { a.p = mover(a.p); });
  estado.giro += d;
}
function concluir() {
  const cm = estado.atual;
  if (cm.cantos.length < 3 && ia.poli) { // sem cantos marcados à mão: usa as paredes achadas pela IA
    cm.cantos = ia.poli.cantos.map(p => ({ x: p.x, z: p.z })); cm.ia = true;
    for (const a of ia.poli.aberturas) if (!cm.aberturas.some(b => dist(b.p, a.p) < 0.6)) cm.aberturas.push({ id: novoId(), tipo: a.tipo, p: a.p, larg: a.larg, ia: true });
  }
  if (cm.cantos.length < 3) return;
  cm.cantos = esquadrejar(cm.cantos);
  const sug = sugerirJanelas(cm);
  encaixar(cm); cm.fechado = true;
  if (cm.aberturas.some(a => a.entrada)) alinhar(cm);
  else if (casa.comodos[0] === cm) endireitar(cm);
  estado.etapa = 'resumo'; salvar(); sujar(); ui();
  aviso(`✅ ${cm.nome}: ${fmt(area(cm.cantos), 1)} m²<small>${sug ? `💡 ${sug} possível janela pela claridade` : 'planta atualizada'}</small>`);
  narrar(`<b>${cm.nome}: ${fmt(area(cm.cantos), 1)} m²</b>. As paredes foram <b>esquadrejadas</b> (cantos de 90°) e as portas e janelas encaixadas nelas.${sug ? ' Pela claridade, o app sugere uma janela.' : ''}`);
}
function refazer() {
  const cm = estado.atual; if (!cm || !['cantos', 'resumo'].includes(estado.etapa)) return;
  if (casa.comodos.some(c => c !== cm && c.aberturas.some(a => a.liga && a.liga.c === cm.id && !a.entrada))) return aviso('Já tem cômodo ligado a este', '#b45309');
  cm.cantos = []; cm.fechado = false;
  cm.aberturas = cm.aberturas.filter(a => a.entrada); cm.aberturas.forEach(a => { delete a.parede; delete a.t; });
  zerarVolta(); estado.etapa = 'cantos'; salvar(); sujar(); ui();
}
function livres() { // portas/passagens que ainda não levam a nenhum cômodo
  const r = [];
  for (const c of casa.comodos) {
    if (!c.fechado) continue;
    const cont = {};
    for (const a of c.aberturas) {
      cont[a.tipo] = (cont[a.tipo] || 0) + 1;
      if (a.tipo !== 'janela' && !a.liga && !a.entrada) r.push({ c, a, rot: `${ICONE[a.tipo]} ${NOME[a.tipo]} ${cont[a.tipo]} · ${c.nome}` });
    }
  }
  return r;
}
function executar(a) {
  const [acao, x, y] = a.split(':');
  if (acao === 'canto') marcarCanto();
  else if (acao in LARG) marcarAbertura(acao);
  else if (acao === 'desfazer') desfazer();
  else if (acao === 'concluir') concluir();
  else if (acao === 'entrada') entrei();
  else if (acao === 'nome') novoComodo(x);
  else if (acao === 'ir') { estado.ligacao = { c: x, a: y }; estado.etapa = 'nome'; ui(); }
  else if (acao === 'separado') { estado.ligacao = null; estado.etapa = 'nome'; ui(); }
  else if (acao === 'planta') abrirPlanta();
  else if (acao === 'teto') { if (estado.atual && estado.atual.fechado) { estado.etapa = 'teto'; ui(); } }
  else if (acao === 'medirTeto') medirTeto();
  else if (acao === 'cancelar') { estado.etapa = 'resumo'; ui(); }
  else if (acao === 'maisPorta') { if (estado.atual && estado.atual.fechado) { estado.etapa = 'porta'; ui(); } }
  else if (acao === 'extra') { // porta/passagem marcada depois de concluir (a IA não viu, ou estava atrás de um móvel)
    const m = miraEstavel(), cm = estado.atual; if (!m) return aviso('Mire a <b>base</b> da porta, no chão', '#b45309');
    cm.aberturas.push({ id: novoId(), tipo: x, p: { x: m.x, z: m.z }, larg: LARG[x] }); encaixar(cm);
    estado.etapa = 'resumo'; pop(); salvar(); sujar(); ui(); aviso(`${ICONE[x]} ${NOME[x]} marcada`, COR_AB[x]);
  }
  else if (acao === 'sim' || acao === 'nao') {
    const cm = estado.atual, ab = cm.aberturas.find(b => b.id === x);
    if (ab) { if (acao === 'sim') delete ab.sugerida; else cm.aberturas.splice(cm.aberturas.indexOf(ab), 1); }
    salvar(); sujar(); ui();
  }
}
$('barra').addEventListener('click', e => { const b = e.target.closest('button[data-a]'); if (b && !b.disabled) executar(b.dataset.a); });
$('btnRefazer').addEventListener('click', refazer);
$('iaChip').addEventListener('click', () => { verIA = !verIA; iaCv.hidden = !verIA; aviso(verIA ? '👁️ Mostrando o que a IA vê <small>amarelo = parede · verde = chão · laranja = porta · azul = janela</small>' : 'Visão da IA escondida', '#7c3aed'); });
$('btnPlanta').addEventListener('click', () => abrirPlanta());

// ---------- painel de baixo ----------
function ui() {
  const cm = estado.atual, e = estado.etapa; let txt = '', ac = '', st = '';
  if (e === 'nome') {
    const A = estado.ligacao && abertura(estado.ligacao);
    txt = A ? `Atravesse a <b>${NOME[A.tipo].toLowerCase()}</b> e entre no próximo cômodo. <b>Que cômodo é?</b>`
      : casa.comodos.length ? '<b>Novo cômodo</b> (sem ligação com os outros). Que cômodo é?'
        : '<b>Vamos começar!</b> Fique de pé no <b>meio do cômodo</b>, celular em pé na altura do peito. <b>Que cômodo é este?</b>';
    ac = `<div class="chips">${NOMES.map(n => `<button data-a="nome:${n}">${n}</button>`).join('')}</div>`;
    st = '🏠 Escolha o cômodo';
  } else if (e === 'entrada') {
    txt = `Pare no <b>meio</b> do(a) ${cm.nome}. Vire para a porta por onde entrou, <b>mire a soleira</b> (o chão da porta) e toque:`;
    ac = '<div class="acoes"><button class="principal" style="grid-column:span 4" data-a="entrada">🚪 Entrei por esta porta</button></div>';
    st = `🔗 ${cm.nome}: emendando na planta`;
  } else if (e === 'cantos') {
    const n = cm.cantos.length, v = volta(), iaOk = n === 0 && ia.poli;
    txt = n === 0 && IA ? (ia.poli ? `🤖 A IA já achou <b>${ia.poli.cantos.length} paredes</b>${ia.poli.aberturas.length ? ` e <b>${ia.poli.aberturas.length} porta(s)/janela(s)</b>` : ''}. Continue girando devagar até fechar a volta.`
      : '🤖 <b>Só gire devagar</b>, com o celular um pouco inclinado para o chão. A IA procura sozinha a linha onde a <b>parede encontra o chão</b>. <small>(Os botões continuam valendo, se quiser marcar à mão.)</small>')
      : n === 0 ? 'Gire devagar. <b>Mire um canto do chão</b> (onde duas paredes se encontram) e toque <b>📍 Canto</b>.'
      : n < 3 ? `Boa! Continue girando no mesmo sentido e marque o próximo canto (${n} de pelo menos 3).`
        : v < 0.9 ? 'Continue a volta. Viu <b>porta, janela ou passagem</b>? Mire a <b>base</b> dela no chão e toque no botão.'
          : '<b>Volta completa!</b> Toque em <b>✅ Concluir</b> para fechar a planta do cômodo.';
    ac = `<div class="acoes"><button class="principal" data-a="canto">📍 Canto</button><button data-a="porta">🚪 Porta</button><button data-a="janela">🪟 Janela</button>
      <button data-a="passagem">↔️ Passagem</button><button data-a="desfazer" ${estado.pilha.length ? '' : 'disabled'}>↩️ Voltar</button>
      <button class="fim ${(n >= 3 || iaOk) && v >= 0.9 ? 'pronto' : ''}" data-a="concluir" ${n < 3 && !iaOk ? 'disabled' : ''}>✅ Concluir</button></div>`;
    st = `📍 ${cm.nome} · ${n} canto${n === 1 ? '' : 's'}`;
  } else if (e === 'porta') {
    txt = `Mire a <b>base da porta</b> (ou passagem) do(a) ${cm.nome} no chão e toque:`;
    ac = '<div class="acoes"><button class="principal" data-a="extra:porta">🚪 Porta</button><button data-a="extra:passagem">↔️ Passagem</button><button data-a="cancelar">✕</button></div>';
    st = `🚪 ${cm.nome}: marcar porta`;
  } else if (e === 'teto') {
    txt = `📐 <b>Altura do teto</b> do(a) ${cm.nome}: levante o celular e mire a <b>linha onde a parede encontra o teto</b> (de preferência uma parede livre, sem armário).`;
    ac = '<div class="acoes"><button class="principal" style="grid-column:span 3" data-a="medirTeto">📐 Medir aqui</button><button data-a="cancelar">✕</button></div>';
    st = `📐 ${cm.nome}: altura do teto`;
  } else if (e === 'resumo') {
    const L = livres();
    if (cm) {
      const c = t => cm.aberturas.filter(a => a.tipo === t && !a.sugerida).length;
      txt = `✅ <b>${cm.nome}</b>: ${fmt(area(cm.cantos), 1)} m² · ${cm.cantos.length} paredes · ${c('porta') + c('passagem')} porta/passagem · ${c('janela')} janela${cm.pe ? ` · teto ${fmt(cm.pe)} m` : ''}`;
      for (const a of cm.aberturas.filter(b => b.sugerida))
        txt += `<div class="sugestao"><span>💡 Pela <b>claridade</b>, parece ter uma <b>janela</b> ali (tracejada na planta).</span><button data-a="sim:${a.id}">✅ é</button><button data-a="nao:${a.id}">❌</button></div>`;
    } else txt = `🏠 Você tem <b>${casa.comodos.length} cômodo(s)</b> salvos (${fmt(areaTotal(), 1)} m²).`;
    txt += L.length ? '<br><b>Para onde agora?</b> Escolha a porta e passe por ela:' : '<br>Toque em <b>🚪 Marcar porta</b> para emendar o próximo cômodo.';
    ac = `<div class="chips">${L.map(l => `<button class="vai" data-a="ir:${l.c.id}:${l.a.id}">➡️ ${l.rot}</button>`).join('')}
      ${cm && cm.fechado ? `<button class="sec" data-a="teto">📐 ${cm.pe ? 'Medir o teto de novo' : 'Altura do teto'}</button>` : ''}${cm && cm.fechado ? '<button class="sec" data-a="maisPorta">🚪 Marcar porta</button>' : ''}<button class="sec" data-a="planta">🗺️ Ver a planta</button><button class="sec" data-a="separado">➕ Cômodo separado</button></div>`;
    st = `🏠 ${casa.comodos.length} cômodo(s) · ${fmt(areaTotal(), 1)} m²`;
  }
  $('barraTxt').innerHTML = txt; $('barraAcoes').innerHTML = ac; $('statusTxt').textContent = st;
  $('status').className = e === 'resumo' ? 'achou' : 'procurando';
  $('volta').hidden = e !== 'cantos';
  if (e === 'cantos') { const v = volta(); $('voltaArco').setAttribute('stroke-dasharray', `${(v * 169.6).toFixed(1)} 170`); $('voltaTxt').textContent = Math.round(v * 100) + '%'; }
}
const areaTotal = () => casa.comodos.filter(c => c.fechado).reduce((s, c) => s + area(c.cantos), 0);

// ---------- desenho da planta (mini, tela cheia e imagem para compartilhar) ----------
function limites(pts) {
  if (!pts.length) return { x0: -2, x1: 2, z0: -2, z1: 2 };
  return { x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)), z0: Math.min(...pts.map(p => p.z)), z1: Math.max(...pts.map(p => p.z)) };
}
function enquadrar(W, H, vivo, pad) {
  const pts = casa.comodos.flatMap(c => [...c.cantos, ...c.aberturas.map(a => a.p)]);
  if (estado.atual && estado.etapa !== 'capa') pts.push(estado.atual.origem);
  if (vivo && estado.mira && ['cantos', 'entrada'].includes(estado.etapa)) pts.push(estado.mira);
  if (vivo && ia.poli && estado.etapa === 'cantos') pts.push(...ia.poli.cantos);
  const B = limites(pts), sx = Math.max(B.x1 - B.x0, 3.5), sz = Math.max(B.z1 - B.z0, 3.5);
  return { cx: (B.x0 + B.x1) / 2, cz: (B.z0 + B.z1) / 2, esc: Math.min((W - 2 * pad) / sx, (H - 2 * pad) / sz) };
}
function desenharPlanta(g, W, H, v, op = {}) {
  const k = op.k || 1, X = p => (p.x - v.cx) * v.esc + W / 2, Y = p => (p.z - v.cz) * v.esc + H / 2;
  g.save(); g.beginPath(); g.rect(0, 0, W, H); g.clip(); g.fillStyle = op.fundo || '#f8fafc'; g.fillRect(0, 0, W, H);
  if (v.esc > 12 * k && !op.semGrade) { // grade de 1 m
    g.strokeStyle = '#e2e8f0'; g.lineWidth = k;
    const mx = W / 2 / v.esc, mz = H / 2 / v.esc;
    for (let x = Math.floor(v.cx - mx); x <= v.cx + mx; x++) { g.beginPath(); g.moveTo(X({ x, z: 0 }), 0); g.lineTo(X({ x, z: 0 }), H); g.stroke(); }
    for (let z = Math.floor(v.cz - mz); z <= v.cz + mz; z++) { g.beginPath(); g.moveTo(0, Y({ x: 0, z })); g.lineTo(W, Y({ x: 0, z })); g.stroke(); }
  }
  const caminho = c => { g.beginPath(); c.forEach((p, i) => (i ? g.lineTo(X(p), Y(p)) : g.moveTo(X(p), Y(p)))); };
  const fechados = casa.comodos.filter(c => c.fechado && c.cantos.length >= 3);
  for (const cm of fechados) { caminho(cm.cantos); g.closePath(); g.fillStyle = cm.cor; g.fill(); }
  if (op.moveis) desenharMoveis(g, X, Y, v.esc, k);
  for (const cm of fechados) desenharParedes(g, cm, X, Y, v.esc, k);
  const at = estado.atual;
  if (op.vivo && at && !at.fechado && estado.etapa === 'cantos' && ia.n) { // o que a IA achou: pontos e paredes
    for (const r of (ia.poli ? ia.poli.rep : ia.bins.map(b => b[b.length - 1]))) if (r) { g.beginPath(); g.arc(X(r), Y(r), 1.8 * k, 0, 7); g.fillStyle = r.salto ? '#cbd5e1' : r.tipo === 'porta' ? '#f97316' : r.tipo === 'janela' ? '#0ea5e9' : '#a855f7'; g.fill(); }
    if (ia.poli) { g.setLineDash([5 * k, 3 * k]); g.strokeStyle = '#7c3aed'; g.lineWidth = 2.5 * k; caminho(ia.poli.cantos); g.closePath(); g.stroke(); g.setLineDash([]); }
  }
  if (at && !at.fechado) { // cômodo sendo medido agora
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (at.cantos.length >= 3) { g.setLineDash([4 * k, 4 * k]); g.strokeStyle = '#94a3b8'; g.lineWidth = 1.5 * k; caminho([at.cantos[at.cantos.length - 1], at.cantos[0]]); g.stroke(); }
    if (op.vivo && estado.mira && estado.etapa === 'cantos' && at.cantos.length) {
      g.setLineDash([5 * k, 4 * k]); g.strokeStyle = '#ca8a04'; g.lineWidth = 2 * k; caminho([at.cantos[at.cantos.length - 1], estado.mira]); g.stroke();
    }
    g.setLineDash([]); g.strokeStyle = '#16a34a'; g.lineWidth = 3 * k; caminho(at.cantos); g.stroke();
    for (const p of at.cantos) { g.beginPath(); g.arc(X(p), Y(p), 3.5 * k, 0, 7); g.fillStyle = '#16a34a'; g.fill(); }
    for (const a of at.aberturas) { g.beginPath(); g.arc(X(a.p), Y(a.p), 6 * k, 0, 7); g.fillStyle = COR_AB[a.tipo]; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5 * k; g.stroke(); }
  }
  if (op.voce && at) { // você está aqui (e para onde está olhando)
    const cx = X(at.origem), cy = Y(at.origem), ang = Math.atan2(estado.dir.z, estado.dir.x);
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 30 * k, ang - 0.45, ang + 0.45); g.closePath(); g.fillStyle = 'rgba(37,99,235,.28)'; g.fill();
    g.beginPath(); g.arc(cx, cy, 6 * k, 0, 7); g.fillStyle = '#2563eb'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2 * k; g.stroke();
    if (op.vivo && estado.mira && estado.etapa !== 'resumo') {
      const mx = X(estado.mira), my = Y(estado.mira); g.strokeStyle = '#ca8a04'; g.lineWidth = 2 * k;
      g.beginPath(); g.moveTo(mx - 5 * k, my); g.lineTo(mx + 5 * k, my); g.moveTo(mx, my - 5 * k); g.lineTo(mx, my + 5 * k); g.stroke();
    }
  }
  for (const cm of fechados) { // nome, área e pé-direito
    const c = centro(cm.cantos), fs = Math.max(9 * k, Math.min(16 * k, v.esc * 0.3)), op2 = op.moveis && moveisSalvos().length;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const linhas = [[`800 ${fs}px`, '#0f172a', cm.nome], [`600 ${fs * 0.85}px`, '#475569', `${fmt(area(cm.cantos), 1)} m²`]];
    if (op.cotas) linhas.push([`600 ${fs * 0.7}px`, '#64748b', `PD ${fmt(peDe(cm))} m`]);
    const alt = linhas.length * fs * 1.1;
    if (op2) { g.font = linhas[0][0] + ' -apple-system, Segoe UI, Arial'; const lw = Math.max(...linhas.map(l => (g.font = l[0] + ' -apple-system, Segoe UI, Arial', g.measureText(l[2]).width))); g.fillStyle = 'rgba(255,255,255,.82)'; g.beginPath(); g.roundRect(X(c) - lw / 2 - 6 * k, Y(c) - alt / 2 - 3 * k, lw + 12 * k, alt + 6 * k, 6 * k); g.fill(); }
    linhas.forEach(([f, cor, t], i) => { g.font = `${f} -apple-system, Segoe UI, Arial`; g.fillStyle = cor; g.fillText(t, X(c), Y(c) - alt / 2 + fs * 1.1 * (i + 0.5)); });
  }
  if (op.cotas) for (const cm of fechados) for (let i = 0; i < cm.cantos.length; i++) { // cota de cada parede: linha com tracinhos, por dentro do cômodo
    const w = parede(cm, i), fs = 10.5 * k, off = 15 * k, ox = w.n.x * off, oy = w.n.z * off;
    const ux = w.u.x * off, uy = w.u.z * off; // encurta nas pontas: as cotas não se cruzam nos cantos
    const a = { x: X(w.a) + ox + ux, y: Y(w.a) + oy + uy }, b = { x: X(w.b) + ox - ux, y: Y(w.b) + oy - uy }, trava = cm.travas && cm.travas[i] != null;
    if (Math.hypot(b.x - a.x, b.y - a.y) < 34 * k) continue;
    const ang0 = Math.atan2(b.y - a.y, b.x - a.x), cor = trava ? '#7c3aed' : '#b91c1c';
    g.strokeStyle = cor; g.lineWidth = 0.9 * k; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    for (const p of [a, b]) { g.beginPath(); g.moveTo(p.x - 4 * k * Math.cos(ang0 - 0.8), p.y - 4 * k * Math.sin(ang0 - 0.8)); g.lineTo(p.x + 4 * k * Math.cos(ang0 - 0.8), p.y + 4 * k * Math.sin(ang0 - 0.8)); g.lineWidth = 1.4 * k; g.stroke(); }
    let ang = ang0; if (ang > Math.PI / 2 + 0.01) ang -= Math.PI; else if (ang < -Math.PI / 2 + 0.01) ang += Math.PI; // texto sempre de pé
    const txt = `${fmt(w.L)}${trava ? ' 🔒' : ''}`;
    g.save(); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2); g.rotate(ang);
    g.font = `700 ${fs}px -apple-system, Segoe UI, Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const tw = g.measureText(txt).width; g.fillStyle = '#ffffff'; g.fillRect(-tw / 2 - 3 * k, -fs * 0.62, tw + 6 * k, fs * 1.24);
    g.fillStyle = cor; g.fillText(txt, 0, 0); g.restore();
  }
  if (op.geral && fechados.length) { // cota geral da casa (por fora): largura e profundidade totais
    const B = limites(fechados.flatMap(c => c.cantos)), off = 22 * k, fs = 11.5 * k;
    g.strokeStyle = '#334155'; g.fillStyle = '#334155'; g.lineWidth = 1 * k; g.font = `800 ${fs}px -apple-system, Segoe UI, Arial`; g.textAlign = 'center'; g.textBaseline = 'bottom';
    const yT = Y({ x: 0, z: B.z0 }) - off, xL = X({ x: B.x0, z: 0 }) - off;
    const linhaCota = (x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); for (const [x, y] of [[x0, y0], [x1, y1]]) { g.beginPath(); g.moveTo(x - 4 * k, y + 4 * k); g.lineTo(x + 4 * k, y - 4 * k); g.stroke(); } };
    linhaCota(X({ x: B.x0, z: 0 }), yT, X({ x: B.x1, z: 0 }), yT);
    for (const x of [B.x0, B.x1]) { g.setLineDash([2 * k, 2 * k]); g.beginPath(); g.moveTo(X({ x, z: 0 }), yT - 3 * k); g.lineTo(X({ x, z: 0 }), Y({ x: 0, z: B.z0 }) - 3 * k); g.stroke(); g.setLineDash([]); }
    g.fillText(`${fmt(B.x1 - B.x0)} m`, (X({ x: B.x0, z: 0 }) + X({ x: B.x1, z: 0 })) / 2, yT - 3 * k);
    linhaCota(xL, Y({ x: 0, z: B.z0 }), xL, Y({ x: 0, z: B.z1 }));
    for (const z of [B.z0, B.z1]) { g.setLineDash([2 * k, 2 * k]); g.beginPath(); g.moveTo(xL + 3 * k, Y({ x: 0, z })); g.lineTo(X({ x: B.x0, z: 0 }) - 3 * k, Y({ x: 0, z })); g.stroke(); g.setLineDash([]); }
    g.save(); g.translate(xL - 3 * k, (Y({ x: 0, z: B.z0 }) + Y({ x: 0, z: B.z1 })) / 2); g.rotate(-Math.PI / 2); g.fillText(`${fmt(B.z1 - B.z0)} m`, 0, 0); g.restore();
  }
  if (op.editar) { // alças do editor
    const sel = op.editar.sel;
    if (sel && sel.tipo === 'parede') { const w = parede(sel.cm, sel.i); g.strokeStyle = 'rgba(249,115,22,.75)'; g.lineWidth = 9 * k; g.lineCap = 'round'; g.beginPath(); g.moveTo(X(w.a), Y(w.a)); g.lineTo(X(w.b), Y(w.b)); g.stroke(); }
    if (sel && sel.tipo === 'comodo') { caminho(sel.cm.cantos); g.closePath(); g.strokeStyle = '#2563eb'; g.lineWidth = 3 * k; g.setLineDash([6 * k, 4 * k]); g.stroke(); g.setLineDash([]); }
    for (const cm of fechados) {
      for (let i = 0; i < cm.cantos.length; i++) { const p = cm.cantos[i], s = sel && sel.tipo === 'canto' && sel.cm === cm && sel.i === i; g.beginPath(); g.arc(X(p), Y(p), (s ? 9 : 7) * k, 0, 7); g.fillStyle = s ? '#2563eb' : '#fff'; g.fill(); g.strokeStyle = '#2563eb'; g.lineWidth = 2.5 * k; g.stroke(); }
      for (const a of cm.aberturas) { const s = sel && sel.a === a; g.beginPath(); g.arc(X(a.p), Y(a.p), (s ? 8 : 6) * k, 0, 7); g.fillStyle = COR_AB[a.tipo]; g.fill(); g.strokeStyle = s ? '#0f172a' : '#fff'; g.lineWidth = 2 * k; g.stroke(); }
    }
  }
  g.restore();
}
// móveis colocados no modo 🥽 VR aparecem na planta (vista de cima, em escala)
function moveisSalvos() {
  const f = casa.comodos.filter(c => c.fechado && c.cantos.length >= 3); if (!f.length) return [];
  try { const d = JSON.parse(localStorage.getItem('decora-vr-v1') || '{}')[f[0].id]; return d && Array.isArray(d.itens) ? d.itens : []; } catch (e) { return []; }
}
function desenharMoveis(g, X, Y, esc, k) {
  for (const d of moveisSalvos()) {
    if (d.local === 'teto' || d.local === 'parede' || d.w == null) continue;
    const c = Math.cos(d.rot || 0), s = Math.sin(d.rot || 0), u = { x: c, z: -s }, f = { x: s, z: c }, a = d.w / 2, b = d.p / 2;
    const P = (i, j) => ({ x: d.x + u.x * a * i + f.x * b * j, z: d.z + u.z * a * i + f.z * b * j });
    const R = [P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)];
    g.beginPath(); R.forEach((p, i) => (i ? g.lineTo(X(p), Y(p)) : g.moveTo(X(p), Y(p)))); g.closePath();
    const tapete = /tapete/.test(d.tipo);
    g.fillStyle = tapete ? 'rgba(148,163,184,.12)' : 'rgba(255,255,255,.88)'; g.fill();
    g.setLineDash(tapete ? [4 * k, 3 * k] : []); g.strokeStyle = '#64748b'; g.lineWidth = 1.2 * k; g.stroke(); g.setLineDash([]);
    const linha = (i0, j0, i1, j1) => { g.beginPath(); g.moveTo(X(P(i0, j0)), Y(P(i0, j0))); g.lineTo(X(P(i1, j1)), Y(P(i1, j1))); g.stroke(); };
    g.lineWidth = 0.9 * k;
    if (/cama/.test(d.tipo)) { linha(-1, -0.62, 1, -0.62); linha(-0.05, -1, -0.05, -0.62); linha(-1, -0.2, 1, -0.2); } // travesseiros e edredom
    else if (/sofa/.test(d.tipo)) { linha(-1, -0.45, 1, -0.45); linha(-0.8, -0.45, -0.8, 1); linha(0.8, -0.45, 0.8, 1); }
    else if (/balcao/.test(d.tipo)) { g.strokeRect(X(P(-0.75, -0.6)), Y(P(-0.75, -0.6)), (X(P(-0.2, 0.4)) - X(P(-0.75, -0.6))), (Y(P(-0.2, 0.4)) - Y(P(-0.75, -0.6)))); }
    else if (/vaso_sanit|pia_ban/.test(d.tipo)) { g.beginPath(); const q = P(0, 0.2); g.ellipse(X(q), Y(q), a * esc * 0.6, b * esc * 0.45, 0, 0, 7); g.stroke(); }
    else if (/mesa/.test(d.tipo)) { linha(-0.85, -0.85, 0.85, -0.85); }
    if (d.nome && d.w * esc > 46 * k && !tapete) {
      g.save(); const cc = P(0, 0.05); g.translate(X(cc), Y(cc)); let ang = Math.atan2(u.z, u.x); if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI; g.rotate(ang);
      g.font = `600 ${8.5 * k}px -apple-system, Segoe UI, Arial`; g.fillStyle = '#475569'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(d.nome, 0, 0); g.restore();
    }
  }
}
function desenharParedes(g, cm, X, Y, esc, k) {
  const lw = Math.max(2.5 * k, ESP * esc * 1.3);
  for (let i = 0; i < cm.cantos.length; i++) {
    const w = parede(cm, i), P = s => add(w.a, mul(w.u, s));
    const vaos = cm.aberturas.filter(a => a.parede === i).map(a => ({ a, s0: a.t * w.L - a.larg / 2, s1: a.t * w.L + a.larg / 2 })).sort((p, q) => p.s0 - q.s0);
    g.strokeStyle = '#0f172a'; g.lineWidth = lw; g.lineCap = 'square'; g.setLineDash([]);
    const seg = (s0, s1) => { if (s1 - s0 < 0.01) return; g.beginPath(); g.moveTo(X(P(s0)), Y(P(s0))); g.lineTo(X(P(s1)), Y(P(s1))); g.stroke(); };
    let s = 0; for (const v of vaos) { seg(s, v.s0); s = Math.max(s, v.s1); } seg(s, w.L);
    g.lineCap = 'butt';
    for (const v of vaos) {
      const a = v.a, p0 = P(v.s0), p1 = P(v.s1);
      if (a.tipo === 'janela') { // símbolo de janela: linhas finas duplas
        const o = mul(w.n, ESP * 0.6);
        g.setLineDash(a.sugerida ? [4 * k, 3 * k] : []); g.strokeStyle = '#0284c7'; g.lineWidth = 1.6 * k;
        for (const f of [-1, 0, 1]) { g.beginPath(); g.moveTo(X(add(p0, mul(o, f))), Y(add(p0, mul(o, f)))); g.lineTo(X(add(p1, mul(o, f))), Y(add(p1, mul(o, f)))); g.stroke(); }
      } else if (a.tipo === 'porta' && !a.entrada) { // folha da porta + arco de abertura
        const r = a.larg * esc, hx = X(p0), hy = Y(p0), a0 = Math.atan2(w.u.z, w.u.x), aN = Math.atan2(w.n.z, w.n.x);
        let d = aN - a0; d = Math.atan2(Math.sin(d), Math.cos(d));
        g.setLineDash([]); g.strokeStyle = '#ea580c'; g.lineWidth = 1.8 * k;
        g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + Math.cos(aN) * r, hy + Math.sin(aN) * r); g.stroke();
        g.lineWidth = 1.1 * k; g.beginPath(); g.arc(hx, hy, r, a0, a0 + d, d < 0); g.stroke();
      } else if (a.tipo === 'passagem' && !a.entrada) {
        g.setLineDash([3 * k, 3 * k]); g.strokeStyle = '#9333ea'; g.lineWidth = 1.5 * k;
        g.beginPath(); g.moveTo(X(p0), Y(p0)); g.lineTo(X(p1), Y(p1)); g.stroke();
      }
    }
    g.setLineDash([]);
  }
}
let vistaMini = null;
function desenharMini() {
  const cv = $('mini'), W = cv.width, H = cv.height; if (!W) return;
  const alvo = enquadrar(W, H, true, 16 * dpr);
  if (!vistaMini) vistaMini = alvo; else for (const c of ['cx', 'cz', 'esc']) vistaMini[c] += (alvo[c] - vistaMini[c]) * 0.15; // sem "pulos"
  desenharPlanta(cv.getContext('2d'), W, H, vistaMini, { k: dpr * 0.8, vivo: true, voce: true });
  const t = areaTotal(); $('miniArea').textContent = t ? fmt(t, 1) + ' m²' : '';
}

// ---------- planta completa: 2D com medidas e maquete 3D ----------
let aba = '2d', notaPlanta = '';
function abrirPlanta() { $('planta').hidden = false; trocarAba(aba); abrirResumo(); if (casa.comodos.some(c => c.fechado)) narrar(`Planta da casa: <b>${casa.comodos.filter(c => c.fechado).length} cômodo(s), ${fmt(areaTotal(), 1)} m²</b>, com cotas como numa planta de arquiteto. Dá para corrigir qualquer medida em ✏️ Editar.`, 'planta'); }
function abrirResumo() {
  const f = casa.comodos.filter(c => c.fechado);
  const nota = notaPlanta ? `<div class="nota-planta">${notaPlanta}</div>` : ''; notaPlanta = '';
  $('resumo').innerHTML = nota + (f.length
    ? `<b>${f.length} cômodo(s) · ${fmt(areaTotal(), 1)} m² no total</b>${casa.calibrado ? ' · 📏 calibrada com trena' : ''}<br>` + f.map(c => {
      const n = t => c.aberturas.filter(a => a.tipo === t && !a.entrada).length;
      let per = 0; for (let i = 0; i < c.cantos.length; i++) per += parede(c, i).L;
      return `<b>${c.nome}</b>: ${fmt(area(c.cantos), 1)} m² · perímetro ${fmt(per, 1)} m · teto ${fmt(peDe(c))} m${c.pe ? ' 📐' : casa.pe ? ' (do último medido)' : ' (padrão)'} · ${n('porta')} 🚪 ${n('janela')} 🪟 ${n('passagem')} ↔️`;
    }).join('<br>')
    : 'Nenhum cômodo concluído ainda. Marque os cantos e toque em ✅ Concluir.');
}
// 🧮 Lista de materiais: o que comprar para reformar, calculado da planta
function materiais() {
  const linhas = casa.comodos.filter(c => c.fechado).map(c => {
    const pe = peDe(c); let per = 0; for (let i = 0; i < c.cantos.length; i++) per += parede(c, i).L;
    let vaos = 0, vaoChao = 0;
    for (const a of c.aberturas) {
      if (a.tipo === 'janela') { if (!a.sugerida) vaos += a.larg * (ALT_JANELA - PEITORIL); }
      else { vaos += a.larg * Math.min(ALT_PORTA, pe); vaoChao += a.larg; }
    }
    const A = area(c.cantos), paredes = Math.max(0, per * pe - vaos);
    return { nome: c.nome, cor: c.cor, piso: A * 1.1, rodape: Math.max(0, per - vaoChao), paredes, teto: A, tinta: (paredes + A) * 2 / RENDE_TINTA, pe, medido: !!c.pe };
  });
  const T = k => linhas.reduce((s, l) => s + l[k], 0);
  return { linhas, piso: T('piso'), rodape: T('rodape'), paredes: T('paredes'), teto: T('teto'), tinta: T('tinta') };
}
function desenharMateriais() {
  const M = materiais(), el = $('materiais');
  if (!M.linhas.length) { el.innerHTML = '<p>Conclua um cômodo para ver a lista de materiais.</p>'; return; }
  const galoes = Math.ceil(M.tinta / 3.6);
  el.innerHTML = `<h3>🧮 Lista de materiais (estimativa)</h3>
    <table><tr><th>Cômodo</th><th>Piso<br><small>m² +10%</small></th><th>Rodapé<br><small>m</small></th><th>Paredes<br><small>m²</small></th><th>Tinta<br><small>litros</small></th></tr>
    ${M.linhas.map(l => `<tr><td><i style="background:${l.cor}"></i>${l.nome}<br><small>teto ${fmt(l.pe)} m${l.medido ? ' 📐' : ''}</small></td><td>${fmt(l.piso, 1)}</td><td>${fmt(l.rodape, 1)}</td><td>${fmt(l.paredes, 1)}</td><td>${fmt(l.tinta, 1)}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td>${fmt(M.piso, 1)}</td><td>${fmt(M.rodape, 1)}</td><td>${fmt(M.paredes, 1)}</td><td>${fmt(M.tinta, 1)}</td></tr></table>
    <div class="compra">🛒 <b>Comprar:</b> ${fmt(M.piso, 1)} m² de piso · ${Math.ceil(M.rodape)} m de rodapé · <b>${galoes} galão(ões) de 3,6 L</b> de tinta</div>
    <p class="como"><b>Como o app calcula:</b> piso = área + 10% de perda nos cortes · rodapé = perímetro − portas e passagens ·
    paredes = perímetro × pé-direito − vãos de portas e janelas · tinta = (paredes + teto) × 2 demãos ÷ ${RENDE_TINTA} m²/L.
    ${M.linhas.some(l => !l.medido) ? `Cômodos sem 📐 usam ${casa.pe ? `o último teto medido (${fmt(casa.pe)} m)` : `o pé-direito padrão de ${fmt(PE_DIREITO)} m`}: toque em 📐 Altura do teto em cada cômodo para ficar exato.` : ''}</p>`;
}
function trocarAba(qual) {
  aba = qual;
  for (const q of ['2d', '3d', 'mat']) $('aba' + q).classList.toggle('ativo', qual === q);
  $('planta2d').hidden = qual !== '2d'; $('maquete').hidden = qual !== '3d'; $('materiais').hidden = qual !== 'mat';
  $('dica3d').hidden = qual === 'mat';
  $('dica3d').textContent = qual === '3d' ? 'arraste para girar · pinça para zoom' : editando ? 'arraste cantos, portas e cômodos · toque numa parede para digitar a medida' : '👆 toque numa parede para mudar a medida · pinça = zoom · 2 toques = tudo';
  $('ferramentas2d').hidden = qual !== '2d'; if (qual !== '2d') fecharFolha();
  if (qual !== '3d') parar3d = true;
  if (qual === '2d') desenhar2d(); else if (qual === '3d') abrirMaquete(); else desenharMateriais();
}
function desenhar2d(manterVista) {
  const cv = $('planta2d'), W = cv.clientWidth * dpr, H = cv.clientHeight * dpr; cv.width = W; cv.height = H;
  if (!manterVista || !vista2d) { vista2d = enquadrar(W, H, false, 46 * dpr); vista2d.W = W; vista2d.H = H; }
  desenharPlanta(cv.getContext('2d'), W, H, vista2d, { k: dpr, cotas: verCotas, moveis: verMoveis, geral: verCotas, voce: estado.etapa !== 'capa' && !editando, fundo: '#ffffff', editar: editando ? { sel: folhaAlvo } : null });
}
let vista2d = null;

// ---------- ✏️ EDITOR DA PLANTA (como nos apps profissionais) ----------
// Arrastar cantos (com ímã de 5 cm e de 90°), portas e janelas ao longo da parede e cômodos inteiros;
// tocar numa parede para digitar a medida exata; acrescentar/remover portas, janelas e passagens;
// dividir parede (cômodo em L), renomear, apagar; desfazer tudo. A medida digitada "trava" a parede (🔒).
let editando = false, verMoveis = true, verCotas = true, folhaAlvo = null, arrastoEd = null;
const pilhaEd = [];
function lembrar() { pilhaEd.push(JSON.stringify(casa)); if (pilhaEd.length > 50) pilhaEd.shift(); $('btnDesfazerEd').disabled = false; }
function desfazerEd() {
  const s = pilhaEd.pop(); if (!s) return;
  const id = estado.atual && estado.atual.id; casa = JSON.parse(s); estado.atual = id ? achar(id) || null : null;
  $('btnDesfazerEd').disabled = !pilhaEd.length; fecharFolha(); depoisDeEditar();
}
function depoisDeEditar(manter = true) { salvar(); sujar(); desenhar2d(manter); abrirResumo(); }
function dentro(p, c) { let r = false; for (let i = 0, j = c.length - 1; i < c.length; j = i++) if ((c[i].z > p.z) !== (c[j].z > p.z) && p.x < (c[j].x - c[i].x) * (p.z - c[i].z) / (c[j].z - c[i].z) + c[i].x) r = !r; return r; }
function reencaixar(cm) { // depois de mexer na geometria: cada abertura continua na SUA parede
  for (const a of cm.aberturas) {
    if (a.parede == null || a.parede >= cm.cantos.length) { encaixar(cm); return; }
    const w = parede(cm, a.parede); a.larg = Math.min(a.larg, w.L * 0.95);
    const meia = a.larg / 2 / w.L, t = Math.max(meia, Math.min(1 - meia, dot(sub(a.p, w.a), w.u) / w.L));
    a.t = t; a.p = add(w.a, mul(w.u, t * w.L));
  }
}
function mudarParede(cm, i, L2) { // nova medida: a parede seguinte anda junto (paralela), mantendo os 90°
  const n = cm.cantos.length, w = parede(cm, i), d = L2 - w.L; if (Math.abs(d) < 0.0005) return;
  const j = (i + 1) % n, k2 = (i + 2) % n, perp = n >= 4 && Math.abs(dot(w.u, parede(cm, j).u)) < 0.3, mov = mul(w.u, d);
  const antes = cm.aberturas.map(a => { const wa = parede(cm, a.parede); return { a, s: dot(sub(a.p, wa.a), wa.u), L: wa.L }; });
  cm.cantos[j] = add(cm.cantos[j], mov); if (perp) cm.cantos[k2] = add(cm.cantos[k2], mov);
  for (const { a, s, L } of antes) {
    const wn = parede(cm, a.parede);
    if (a.parede === i) a.p = add(wn.a, mul(wn.u, s));                         // mantém a distância do começo
    else if (a.parede === j && perp) a.p = add(a.p, mov);                       // a parede inteira andou
    else if (a.parede === (perp ? k2 : j)) a.p = sub(wn.b, mul(wn.u, L - s));    // mantém a distância do fim
  }
  (cm.travas = cm.travas || {})[i] = +L2.toFixed(3);
  reencaixar(cm);
}
function telaParaMundo(e) {
  const r = $('planta2d').getBoundingClientRect(), v = vista2d, px = (e.clientX - r.left) * dpr, py = (e.clientY - r.top) * dpr;
  return { px, py, p: { x: (px - v.W / 2) / v.esc + v.cx, z: (py - v.H / 2) / v.esc + v.cz } };
}
function alvoEm(e) {
  const { px, py, p } = telaParaMundo(e), v = vista2d, T = q => Math.hypot((q.x - v.cx) * v.esc + v.W / 2 - px, (q.z - v.cz) * v.esc + v.H / 2 - py);
  const fech = casa.comodos.filter(c => c.fechado && c.cantos.length >= 3);
  if (editando) {
    for (const cm of fech) for (let i = 0; i < cm.cantos.length; i++) if (T(cm.cantos[i]) < 20 * dpr) return { tipo: 'canto', cm, i, p };
    for (const cm of fech) for (const a of cm.aberturas) if (T(a.p) < 16 * dpr) return { tipo: 'abertura', cm, a, p };
  }
  let melhor = null;
  for (const cm of fech) { const q = naParede(cm.cantos, p); if (!melhor || q.d < melhor.d) melhor = { cm, i: q.i, d: q.d, q: q.q }; }
  if (melhor && melhor.d < Math.max(0.18, 16 * dpr / v.esc)) return { tipo: 'parede', cm: melhor.cm, i: melhor.i, p: melhor.q };
  const cm = fech.find(c => dentro(p, c.cantos)); if (cm && editando) return { tipo: 'comodo', cm, p };
  return null;
}
const ima = (v, passo = 0.05) => Math.round(v / passo) * passo;
const dedos2d = new Map(); let pinca2d = null, ultimoToque = 0;
$('planta2d').addEventListener('pointerdown', e => {
  if (!vista2d) return; $('planta2d').setPointerCapture(e.pointerId); dedos2d.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (dedos2d.size === 2) { // pinça: zoom
    const [p, q] = [...dedos2d.values()]; pinca2d = { d: Math.hypot(p.x - q.x, p.y - q.y), esc: vista2d.esc }; arrastoEd = null; return;
  }
  if (performance.now() - ultimoToque < 300 && !editando) { vista2d = null; desenhar2d(); ultimoToque = 0; return; } // toque duplo: enquadra tudo
  ultimoToque = performance.now();
  const a = alvoEm(e);
  arrastoEd = { a, x0: e.clientX, y0: e.clientY, p0: telaParaMundo(e).p, mexeu: false, vista: { cx: vista2d.cx, cz: vista2d.cz } };
});
const soltarDedo = e => { dedos2d.delete(e.pointerId); if (dedos2d.size < 2) pinca2d = null; };
$('planta2d').addEventListener('pointercancel', soltarDedo);
$('planta2d').addEventListener('pointermove', e => {
  if (dedos2d.has(e.pointerId)) dedos2d.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinca2d && dedos2d.size === 2) {
    const [p, q] = [...dedos2d.values()]; vista2d.esc = Math.max(8 * dpr, Math.min(400 * dpr, pinca2d.esc * Math.hypot(p.x - q.x, p.y - q.y) / pinca2d.d)); desenhar2d(true); return;
  }
  const A = arrastoEd; if (!A) return;
  if (!A.a || (!editando && A.a.tipo === 'parede') || (editando && A.a.tipo === 'parede')) { // arrastar o fundo: move a planta
    if (Math.hypot(e.clientX - A.x0, e.clientY - A.y0) < 6 && !A.mexeu) return; A.mexeu = true; A.pan = true;
    vista2d.cx = A.vista.cx - (e.clientX - A.x0) * dpr / vista2d.esc; vista2d.cz = A.vista.cz - (e.clientY - A.y0) * dpr / vista2d.esc; desenhar2d(true); return;
  }
  if (!editando) return;
  if (!A.mexeu && Math.hypot(e.clientX - A.x0, e.clientY - A.y0) < 6) return;
  if (!A.mexeu) { A.mexeu = true; lembrar(); fecharFolha(); }
  const p = telaParaMundo(e).p, { cm } = A.a;
  if (A.a.tipo === 'canto') {
    const n = cm.cantos.length, viz = [cm.cantos[(A.a.i + n - 1) % n], cm.cantos[(A.a.i + 1) % n]];
    let x = ima(p.x), z = ima(p.z);
    for (const q of viz) { if (Math.abs(q.x - p.x) < 0.15) x = q.x; if (Math.abs(q.z - p.z) < 0.15) z = q.z; } // ímã de 90°
    cm.cantos[A.a.i] = { x, z }; reencaixar(cm);
  } else if (A.a.tipo === 'abertura') {
    const w = parede(cm, A.a.a.parede), meia = A.a.a.larg / 2 / w.L, s = ima(dot(sub(p, w.a), w.u), 0.05);
    A.a.a.t = Math.max(meia, Math.min(1 - meia, s / w.L)); A.a.a.p = add(w.a, mul(w.u, A.a.a.t * w.L));
  } else if (A.a.tipo === 'comodo') {
    const d = { x: ima(p.x - A.p0.x), z: ima(p.z - A.p0.z) }; if (!d.x && !d.z) return; A.p0 = add(A.p0, d);
    cm.cantos = cm.cantos.map(q => add(q, d)); cm.aberturas.forEach(b => { b.p = add(b.p, d); }); cm.origem = add(cm.origem, d);
  }
  desenhar2d(true);
});
$('planta2d').addEventListener('pointerup', e => {
  soltarDedo(e); const A = arrastoEd; arrastoEd = null; if (!A) return;
  if (A.pan) return;
  if (A.mexeu) { depoisDeEditar(); return; }
  if (A.a) abrirFolha(A.a); else fecharFolha();
});
function fecharFolha() { folhaAlvo = null; $('folha').hidden = true; if (vista2d) desenhar2d(true); }
const btn = (a, txt, cls = '') => `<button data-ed="${a}" class="${cls}">${txt}</button>`;
function abrirFolha(alvo) {
  folhaAlvo = alvo; const f = $('folha'), { cm } = alvo; let h = '';
  if (alvo.tipo === 'parede') {
    const w = parede(cm, alvo.i), trava = cm.travas && cm.travas[alvo.i] != null;
    h = `<div class="folha-tit">📏 Parede do(a) ${cm.nome} ${trava ? '<span class="trava">🔒 medida digitada</span>' : ''}</div>
      <div class="linha-medida">${btn('menos', '−5 cm')}<input id="edMedida" inputmode="decimal" value="${fmt(w.L)}"><span>m</span>${btn('mais', '+5 cm')}${btn('aplicar', 'Aplicar', 'ok')}</div>
      <div class="folha-nota">A parede seguinte se move junto, mantendo os cantos a 90°.</div>
      <div class="chips-ed">${btn('trena', '📏 É medida de trena: corrigir a casa toda', 'roxo')}</div>
      <div class="chips-ed">${btn('add:porta', '➕ 🚪 Porta')}${btn('add:janela', '➕ 🪟 Janela')}${btn('add:passagem', '➕ ↔️ Passagem')}${btn('dividir', '➗ Dividir aqui')}</div>`;
  } else if (alvo.tipo === 'abertura') {
    const a = alvo.a;
    h = `<div class="folha-tit">${ICONE[a.tipo]} ${NOME[a.tipo]} · ${cm.nome}${a.entrada ? ' <small>(liga com outro cômodo)</small>' : ''}</div>
      <div class="chips-ed">${['porta', 'janela', 'passagem'].map(t => btn('tipo:' + t, `${ICONE[t]} ${NOME[t]}`, a.tipo === t ? 'sel' : '')).join('')}</div>
      <div class="linha-medida"><span>Largura</span><input id="edMedida" inputmode="decimal" value="${fmt(a.larg)}"><span>m</span>${btn('largura', 'Aplicar', 'ok')}</div>
      <div class="folha-nota">Arraste a ${NOME[a.tipo].toLowerCase()} na planta para mudar de lugar na parede.</div>
      <div class="chips-ed">${a.entrada ? '' : btn('remover', '🗑️ Remover', 'perigo')}</div>`;
  } else if (alvo.tipo === 'canto') {
    h = `<div class="folha-tit">📍 Canto do(a) ${cm.nome}</div><div class="folha-nota">Arraste o canto: ele "gruda" de 5 em 5 cm e se alinha com os vizinhos (90°).</div>
      <div class="chips-ed">${cm.cantos.length > 3 ? btn('tirarCanto', '🗑️ Tirar este canto', 'perigo') : ''}${btn('esquadrejar', '📐 Esquadrejar o cômodo')}</div>`;
  } else if (alvo.tipo === 'comodo') {
    h = `<div class="folha-tit">🏠 ${cm.nome} · ${fmt(area(cm.cantos), 1)} m²</div>
      <div class="chips-ed">${NOMES.map(n => btn('nome:' + n, n, cm.nome === n ? 'sel' : '')).join('')}</div>
      <div class="linha-medida"><span>Pé-direito</span><input id="edMedida" inputmode="decimal" value="${fmt(peDe(cm))}"><span>m</span>${btn('pe', 'Aplicar', 'ok')}</div>
      <div class="folha-nota">Arraste o cômodo para mudar de lugar na planta.</div>
      <div class="chips-ed">${btn('esquadrejar', '📐 Esquadrejar')}${btn('apagarComodo', '🗑️ Apagar cômodo', 'perigo')}</div>`;
  }
  f.innerHTML = `<button class="folha-x" data-ed="fechar">✕</button>${h}`; f.hidden = false; desenhar2d(true);
}
const lerMedida = () => parseFloat(($('edMedida') || { value: '' }).value.replace(',', '.'));
$('folha').addEventListener('click', e => {
  const b = e.target.closest('[data-ed]'); if (!b || !folhaAlvo) return;
  const [acao, x] = b.dataset.ed.split(':'), alvo = folhaAlvo, { cm } = alvo;
  if (acao === 'fechar') return fecharFolha();
  if (acao === 'menos' || acao === 'mais') { const v = lerMedida() + (acao === 'mais' ? 0.05 : -0.05); $('edMedida').value = fmt(Math.max(0.3, v)); return; }
  lembrar();
  if (acao === 'aplicar') { const v = lerMedida(); if (!(v >= 0.3 && v <= 30)) { pilhaEd.pop(); return aviso('Medida inválida', '#b45309'); } mudarParede(cm, alvo.i, v); narrar(`Parede ajustada para <b>${fmt(v)} m</b>: a parede seguinte se moveu junto, mantendo os cantos a 90°.`); }
  else if (acao === 'trena') { const v = lerMedida(), L = parede(cm, alvo.i).L; if (!(v > 0.3) || v / L > 1.6 || v / L < 0.6) { pilhaEd.pop(); return aviso('Digite a medida da trena perto da medida atual', '#b45309'); } escalar(v / L); narrar(`Medida da <b>trena</b>: como tudo é proporcional à altura do celular, a casa inteira foi corrigida em ${fmt((v / L - 1) * 100, 1)}%.`); notaPlanta = `📏 Calibrada com a trena: tudo foi corrigido em ${v / L >= 1 ? '+' : ''}${fmt((v / L - 1) * 100, 1)}% · altura do celular agora ${fmt(casa.h)} m`; }
  else if (acao === 'add') { cm.aberturas.push({ id: novoId(), tipo: x, p: alvo.p, larg: LARG[x] }); encaixar(cm); }
  else if (acao === 'dividir') { cm.cantos.splice(alvo.i + 1, 0, { x: alvo.p.x, z: alvo.p.z }); encaixar(cm); if (cm.travas) cm.travas = {}; }
  else if (acao === 'tipo') { alvo.a.tipo = x; if (x !== 'janela') delete alvo.a.sugerida; }
  else if (acao === 'largura') { const v = lerMedida(); if (v > 0.3 && v < 4) { alvo.a.larg = v; reencaixar(cm); } }
  else if (acao === 'remover') cm.aberturas.splice(cm.aberturas.indexOf(alvo.a), 1);
  else if (acao === 'tirarCanto') { cm.cantos.splice(alvo.i, 1); encaixar(cm); if (cm.travas) cm.travas = {}; }
  else if (acao === 'esquadrejar') { cm.cantos = esquadrejar(cm.cantos); encaixar(cm); }
  else if (acao === 'nome') cm.nome = x;
  else if (acao === 'pe') { const v = lerMedida(); if (v > 1.8 && v < 6) cm.pe = v; }
  else if (acao === 'apagarComodo') {
    if (!confirm(`Apagar o(a) ${cm.nome} da planta?`)) { pilhaEd.pop(); return; }
    casa.comodos.splice(casa.comodos.indexOf(cm), 1);
    for (const c of casa.comodos) c.aberturas.forEach(a => { if (a.liga && a.liga.c === cm.id) delete a.liga; });
    if (estado.atual === cm) estado.atual = null;
  }
  const reabrir = ['tipo', 'largura', 'aplicar', 'pe', 'nome'].includes(acao);
  folhaAlvo = null; $('folha').hidden = true; depoisDeEditar(acao !== 'apagarComodo' && acao !== 'trena');
  if (reabrir && alvo.tipo !== 'comodo' || acao === 'nome' || acao === 'pe') abrirFolha(alvo);
});
function modoEditar(sim) {
  editando = sim; $('btnEditar').classList.toggle('ligado', sim); $('btnEditar').textContent = sim ? '✔ Pronto' : '✏️ Editar';
  $('dica3d').textContent = sim ? 'arraste cantos, portas e cômodos · toque numa parede para digitar a medida' : '👆 toque numa parede para mudar a medida';
  fecharFolha();
}
$('btnEditar').addEventListener('click', () => modoEditar(!editando));
$('btnDesfazerEd').addEventListener('click', desfazerEd);
$('btnMoveisPl').addEventListener('click', () => { verMoveis = !verMoveis; $('btnMoveisPl').classList.toggle('ligado', verMoveis); desenhar2d(true); });
$('btnCotasPl').addEventListener('click', () => { verCotas = !verCotas; $('btnCotasPl').classList.toggle('ligado', verCotas); desenhar2d(true); });
$('aba2d').addEventListener('click', () => trocarAba('2d'));
$('aba3d').addEventListener('click', () => trocarAba('3d'));
$('abamat').addEventListener('click', () => trocarAba('mat'));
$('btnFecharPlanta').addEventListener('click', fecharPlanta);
$('btnContinuar').addEventListener('click', () => { if (estado.etapa === 'capa') iniciar(); else fecharPlanta(); });
function fecharPlanta() { $('planta').hidden = true; parar3d = true; if (estado.etapa === 'capa') $('capa').hidden = false; }

let r3d, cena3d, cam3d, ctrl3d, parar3d = true;
function abrirMaquete() {
  const cv = $('maquete');
  if (!r3d) {
    r3d = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); r3d.setPixelRatio(dpr);
    r3d.shadowMap.enabled = true; r3d.outputColorSpace = THREE.SRGBColorSpace;
    cena3d = new THREE.Scene(); cena3d.background = new THREE.Color('#e2e8f0');
    cam3d = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    ctrl3d = new OrbitControls(cam3d, cv); ctrl3d.enableDamping = true; ctrl3d.maxPolarAngle = Math.PI * 0.48;
  }
  r3d.setSize(cv.clientWidth, cv.clientHeight, false);
  cam3d.aspect = cv.clientWidth / cv.clientHeight; cam3d.updateProjectionMatrix();
  construirMaquete();
  if (parar3d) { parar3d = false; const loop = () => { if (parar3d) return; requestAnimationFrame(loop); ctrl3d.update(); r3d.render(cena3d, cam3d); }; loop(); }
}
function rotulo(texto, sub2) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160; const g = cv.getContext('2d');
  g.fillStyle = 'rgba(15,23,42,.82)'; g.beginPath(); g.roundRect(8, 8, 496, 144, 40); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '800 60px -apple-system, Segoe UI, Arial'; g.fillText(texto, 256, 76);
  g.font = '600 42px -apple-system, Segoe UI, Arial'; g.fillStyle = '#cbd5e1'; g.fillText(sub2, 256, 130);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, depthTest: false })); s.scale.set(1.6, 0.5, 1); s.renderOrder = 10; return s;
}
function construirMaquete() {
  cena3d.traverse(o => { if (o.geometry) o.geometry.dispose(); }); cena3d.clear();
  cena3d.add(new THREE.HemisphereLight('#ffffff', '#94a3b8', 1.6));
  const sol = new THREE.DirectionalLight('#ffffff', 1.6); sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
  const matParede = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.9 });
  const matVidro = new THREE.MeshStandardMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.45, roughness: 0.1 });
  const matPorta = new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.7 });
  const fechados = casa.comodos.filter(c => c.fechado && c.cantos.length >= 3);
  const B = limites(fechados.flatMap(c => c.cantos)), cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2, tam = Math.max(B.x1 - B.x0, B.z1 - B.z0, 4);
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(tam * 3, tam * 3), new THREE.MeshStandardMaterial({ color: '#cbd5e1' }));
  chao.rotation.x = -Math.PI / 2; chao.position.set(cx, -0.01, cz); chao.receiveShadow = true; cena3d.add(chao);
  for (const cm of fechados) {
    const piso = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(cm.cantos.map(p => new THREE.Vector2(p.x, -p.z)))), new THREE.MeshStandardMaterial({ color: cm.cor, roughness: 0.8 }));
    piso.rotation.x = -Math.PI / 2; piso.receiveShadow = true; cena3d.add(piso);
    const PD = peDe(cm), AJ = Math.min(ALT_JANELA, PD - 0.1), AP = Math.min(ALT_PORTA, PD - 0.1);
    for (let i = 0; i < cm.cantos.length; i++) {
      const w = parede(cm, i), ang = -Math.atan2(w.u.z, w.u.x);
      const bloco = (s0, s1, y0, y1, m = matParede, esp = ESP) => {
        if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return;
        const b = new THREE.Mesh(new THREE.BoxGeometry(s1 - s0, y1 - y0, esp), m);
        const c = add(add(w.a, mul(w.u, (s0 + s1) / 2)), mul(w.n, ESP / 2));
        b.position.set(c.x, (y0 + y1) / 2, c.z); b.rotation.y = ang; b.castShadow = b.receiveShadow = m !== matVidro; cena3d.add(b);
      };
      const vaos = cm.aberturas.filter(a => a.parede === i).map(a => ({ a, s0: a.t * w.L - a.larg / 2, s1: a.t * w.L + a.larg / 2 })).sort((p, q) => p.s0 - q.s0);
      let s = 0;
      for (const v of vaos) {
        bloco(s, v.s0, 0, PD);
        if (v.a.tipo === 'janela') { bloco(v.s0, v.s1, 0, PEITORIL); bloco(v.s0, v.s1, AJ, PD); bloco(v.s0, v.s1, PEITORIL, AJ, matVidro, 0.03); }
        else bloco(v.s0, v.s1, AP, PD);
        if (v.a.tipo === 'porta' && !v.a.entrada) { // folha da porta entreaberta
          const dir = add(mul(w.u, Math.cos(1.1)), mul(w.n, Math.sin(1.1))), dob = new THREE.Group(), h0 = add(w.a, mul(w.u, v.s0));
          const folha = new THREE.Mesh(new THREE.BoxGeometry(v.a.larg - 0.03, ALT_PORTA - 0.02, 0.04), matPorta);
          folha.position.set((v.a.larg - 0.03) / 2, (ALT_PORTA - 0.02) / 2, 0); folha.castShadow = true; dob.add(folha);
          dob.position.set(h0.x, 0, h0.z); dob.rotation.y = -Math.atan2(dir.z, dir.x); cena3d.add(dob);
        }
        s = Math.max(s, v.s1);
      }
      bloco(s, w.L, 0, PD);
    }
    const c = centro(cm.cantos), r = rotulo(cm.nome, `${fmt(area(cm.cantos), 1)} m²`); r.position.set(c.x, 1.5, c.z); cena3d.add(r);
  }
  if (estado.atual && estado.etapa !== 'capa') { // você está aqui
    const o = estado.atual.origem, eu = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.9, 6, 12), new THREE.MeshStandardMaterial({ color: '#2563eb' }));
    eu.position.set(o.x, 0.63, o.z); eu.castShadow = true; cena3d.add(eu);
  }
  sol.position.set(cx + tam, tam * 2, cz + tam * 0.6); sol.target.position.set(cx, 0, cz);
  Object.assign(sol.shadow.camera, { left: -tam, right: tam, top: tam, bottom: -tam, far: tam * 6 }); sol.shadow.camera.updateProjectionMatrix();
  cena3d.add(sol, sol.target);
  // enquadra a casa inteira (a tela em pé é estreita: o campo de visão horizontal é que limita)
  const meiaH = Math.atan(Math.tan(cam3d.fov * d2r / 2) * cam3d.aspect), raio = Math.hypot(B.x1 - B.x0, B.z1 - B.z0) / 2 + 0.6;
  const dist3 = raio / Math.sin(Math.min(meiaH, cam3d.fov * d2r / 2)) * 0.9, el = 55 * d2r;
  ctrl3d.target.set(cx, 0.6, cz); cam3d.position.set(cx + dist3 * Math.cos(el) * 0.35, dist3 * Math.sin(el), cz + dist3 * Math.cos(el) * 0.94); ctrl3d.update();
}

async function compartilhar() { // imagem da planta com medidas, para mandar ao arquiteto/marceneiro
  const W = 1400, cv = document.createElement('canvas'); cv.width = W; cv.height = W + 290; const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, W + 290);
  g.fillStyle = '#0f172a'; g.font = '800 54px -apple-system, Segoe UI, Arial'; g.fillText('🏠 Planta da casa', 50, 86);
  const f = casa.comodos.filter(c => c.fechado);
  g.font = '600 30px -apple-system, Segoe UI, Arial'; g.fillStyle = '#475569';
  g.fillText(`${f.length} cômodo(s) · ${fmt(areaTotal(), 1)} m² · ${new Date().toLocaleDateString('pt-BR')} · Decora RA`, 50, 136);
  g.save(); g.translate(0, 170);
  const v = enquadrar(W, W, false, 120); desenharPlanta(g, W, W, v, { k: 2.2, cotas: true, geral: true, moveis: verMoveis, fundo: '#ffffff' });
  g.fillStyle = '#0f172a'; g.fillRect(60, W - 50, v.esc, 10); g.font = '700 26px Arial'; g.fillText('1 m', 60 + v.esc + 12, W - 36); // escala gráfica
  g.restore();
  const M = materiais();
  if (M.linhas.length) {
    g.fillStyle = '#f1f5f9'; g.fillRect(0, W + 180, W, 110); g.fillStyle = '#0f172a'; g.font = '700 30px -apple-system, Segoe UI, Arial';
    g.fillText(`🧮 Piso ${fmt(M.piso, 1)} m² · Rodapé ${Math.ceil(M.rodape)} m · Tinta ${fmt(M.tinta, 1)} L (${Math.ceil(M.tinta / 3.6)} galões)`, 50, W + 228);
    g.font = '500 24px -apple-system, Segoe UI, Arial'; g.fillStyle = '#64748b';
    g.fillText(`estimativa · piso +10% · tinta 2 demãos${casa.calibrado ? ' · medidas calibradas com trena' : ''}`, 50, W + 266);
  }
  const blob = await new Promise(ok => cv.toBlob(ok, 'image/png'));
  const arq = new File([blob], 'planta-da-casa.png', { type: 'image/png' });
  window.ULTIMA_PLANTA = cv.toDataURL('image/png');
  try { if (navigator.canShare && navigator.canShare({ files: [arq] })) { await navigator.share({ files: [arq], title: 'Planta da casa' }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = arq.name; a.click();
}
// 📄 PDF profissional: folha A4 deitada, planta em escala padrão de arquitetura, carimbo e quadro de áreas
async function exportarPDF() {
  if (!window.jspdf) await new Promise((ok, erro) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; s.onload = ok; s.onerror = erro; document.head.appendChild(s); });
  const f = casa.comodos.filter(c => c.fechado && c.cantos.length >= 3); if (!f.length) return aviso('Conclua um cômodo primeiro', '#b45309');
  const { jsPDF } = window.jspdf, pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const LW = 196, LH = 150, PX = 12; // área da planta no papel (mm) e resolução (px por mm)
  const B = limites(f.flatMap(c => c.cantos)), lx = B.x1 - B.x0 + 1.6, lz = B.z1 - B.z0 + 1.6; // casa + margem para as cotas (m)
  const ESC = [25, 50, 75, 100, 125, 150, 200, 250].find(e => lx * 1000 / e <= LW && lz * 1000 / e <= LH) || 300;
  const W = LW * PX, H = LH * PX, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const v = { cx: (B.x0 + B.x1) / 2, cz: (B.z0 + B.z1) / 2, esc: 1000 / ESC * PX };
  desenharPlanta(g, W, H, v, { k: 2.6, cotas: true, geral: true, moveis: verMoveis, fundo: '#ffffff', semGrade: true });
  g.fillStyle = '#0f172a'; for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#0f172a'; g.fillRect(40 + i * v.esc * 0.5, H - 60, v.esc * 0.5, 14); } // escala gráfica 0-2 m
  g.strokeStyle = '#0f172a'; g.lineWidth = 2; g.strokeRect(40, H - 60, v.esc * 2, 14); g.font = '700 30px Arial'; g.fillStyle = '#0f172a'; g.textAlign = 'left';
  g.fillText('0', 34, H - 70); g.fillText('1 m', 40 + v.esc - 18, H - 70); g.fillText('2 m', 40 + v.esc * 2 - 18, H - 70);
  pdf.setDrawColor(15, 23, 42); pdf.setLineWidth(0.6); pdf.rect(6, 6, 285, 198); pdf.setLineWidth(0.25); pdf.rect(8, 8, 281, 194);
  pdf.addImage(cv.toDataURL('image/jpeg', 0.93), 'JPEG', 10, 22, LW, LH);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.text('PLANTA BAIXA', 12, 17);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.text(`Escala 1:${ESC} (folha A4)  ·  medidas em metros  ·  PD = pé-direito`, 60, 17);
  let y = 22; const col = 212, M = materiais();
  const linha = (a, b, bold) => { pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.text(a, col, y); if (b != null) pdf.text(b, 286, y, { align: 'right' }); y += 5; };
  pdf.setFontSize(11); linha('QUADRO DE ÁREAS', null, true); pdf.setFontSize(8.5); y += 1;
  linha('Cômodo', 'Área · perímetro · PD', true);
  for (const c of f) { let per = 0; for (let i = 0; i < c.cantos.length; i++) per += parede(c, i).L; linha(c.nome, `${fmt(area(c.cantos))} m² · ${fmt(per)} m · ${fmt(peDe(c))} m`); }
  pdf.line(col, y - 3.5, 286, y - 3.5); linha('Área total', `${fmt(areaTotal())} m²`, true); y += 3;
  pdf.setFontSize(11); linha('MATERIAIS (estimativa)', null, true); pdf.setFontSize(8.5); y += 1;
  linha('Piso (área + 10%)', `${fmt(M.piso, 1)} m²`); linha('Rodapé', `${Math.ceil(M.rodape)} m`); linha('Paredes (sem vãos)', `${fmt(M.paredes, 1)} m²`);
  linha('Tinta (2 demãos)', `${fmt(M.tinta, 1)} L · ${Math.ceil(M.tinta / 3.6)} galões`); y += 3;
  const n = t => f.reduce((s, c) => s + c.aberturas.filter(a => a.tipo === t && !a.entrada).length, 0);
  pdf.setFontSize(11); linha('ESQUADRIAS', null, true); pdf.setFontSize(8.5); y += 1;
  linha('Portas', String(n('porta'))); linha('Janelas', String(n('janela'))); linha('Passagens', String(n('passagem')));
  // carimbo (selo) no canto, como nas pranchas de arquitetura
  pdf.setLineWidth(0.4); pdf.rect(col - 2, 160, 79, 40); pdf.line(col - 2, 172, 289, 172); pdf.line(col - 2, 186, 289, 186);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.text('Decora RA · Mapear a casa', col, 166);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.text('Levantamento por celular (giroscópio + trigonometria' + (f.some(c => c.ia) ? ' + IA' : '') + ')', col, 170.5);
  pdf.setFontSize(8.5); pdf.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, col, 177.5); pdf.text(`Escala: 1:${ESC}`, 286, 177.5, { align: 'right' });
  pdf.text(`${f.length} cômodo(s) · ${fmt(areaTotal())} m²`, col, 182.5); pdf.text(casa.calibrado ? 'Calibrada com trena' : 'Sem calibração', 286, 182.5, { align: 'right' });
  pdf.setFontSize(6.8); pdf.text(pdf.splitTextToSize('Medidas aproximadas (erro típico de 2 a 5%). Confira as medidas críticas com trena antes de comprar ou executar.', 77), col, 191);
  const blob = pdf.output('blob'), arq = new File([blob], 'planta-da-casa.pdf', { type: 'application/pdf' });
  narrar(`PDF gerado em escala <b>1:${ESC}</b>, com quadro de áreas, materiais e carimbo, pronto para mandar ao arquiteto.`);
  window.ULTIMO_PDF = blob.size; window.ULTIMO_PDF_URL = pdf.output('datauristring');
  try { if (navigator.canShare && navigator.canShare({ files: [arq] })) { await navigator.share({ files: [arq], title: 'Planta da casa' }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = arq.name; a.click();
}
$('btnCompartilhar').addEventListener('click', () => { $('menuEnviar').hidden = !$('menuEnviar').hidden; });
$('menuEnviar').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return; $('menuEnviar').hidden = true;
  try { if (b.dataset.f === 'pdf') { aviso('📄 Gerando o PDF…', '#0f172a'); await exportarPDF(); } else await compartilhar(); } catch (err) { aviso('Não foi possível gerar: ' + err.message, '#b91c1c'); }
});

// ---------- capa ----------
function capa() {
  $('altTxt').textContent = fmt(casa.h) + ' m';
  const tem = casa.comodos.some(c => c.fechado);
  $('btnVerSalva').hidden = $('btnNova').hidden = !tem;
  $('btnComecar').textContent = tem ? `📷 Continuar (${casa.comodos.filter(c => c.fechado).length} cômodo(s))` : '📷 Começar';
}
$('altMenos').addEventListener('click', () => { casa.h = Math.max(0.8, Math.round((casa.h - 0.05) * 100) / 100); salvar(); capa(); });
$('altMais').addEventListener('click', () => { casa.h = Math.min(2.0, Math.round((casa.h + 0.05) * 100) / 100); salvar(); capa(); });
$('btnComecar').addEventListener('click', iniciar);
$('btnVerSalva').addEventListener('click', () => { $('capa').hidden = true; abrirPlanta(); });
$('btnNova').addEventListener('click', () => { if (confirm('Apagar a planta salva e começar outra casa?')) { casa = { h: casa.h, comodos: [] }; salvar(); capa(); } });
if (!window.isSecureContext && !VIDEO_TESTE) $('avisoHttps').hidden = false;
capa();

// ---------- PC sem giroscópio: arrastar para olhar ----------
let arrasto = null;
$('gl').addEventListener('pointerdown', e => { arrasto = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => { arrasto = null; });
$('gl').addEventListener('pointermove', e => {
  if (!arrasto || !estado.pc) return;
  estado.yaw += (e.clientX - arrasto.x) * 0.25; estado.pitch = Math.max(-85, Math.min(30, estado.pitch + (e.clientY - arrasto.y) * 0.25));
  arrasto = { x: e.clientX, y: e.clientY };
});

// 🎬 gravar vídeo com narração: câmera + desenho em RA + visão da IA + planta ao vivo + mira
criarGravador({ nome: 'mapear-casa', botaoEm: $('topo'), compor(g, W2, H2) {
  const k = W2 / innerWidth;
  if (simVR) g.drawImage(simVR.fr.contentDocument.getElementById('vr'), 0, 0, W2, H2); else cobrir(g, video, W2, H2);
  if (!iaCv.hidden && IA) { g.globalAlpha = 0.5; g.drawImage(iaCv, 0, 0, W2, H2); g.globalAlpha = 1; }
  g.drawImage($('gl'), 0, 0, W2, H2);
  if (!$('hud').hidden) {
    const r = $('miniCaixa').getBoundingClientRect(); g.fillStyle = 'rgba(255,255,255,.93)'; g.beginPath(); g.roundRect(r.left * k, r.top * k, r.width * k, r.height * k, 14 * k); g.fill();
    noLugar(g, $('mini'), W2);
    g.strokeStyle = $('mira').classList.contains('ok') ? '#4ade80' : '#fff'; g.lineWidth = 3 * k; g.beginPath(); g.arc(W2 / 2, H2 / 2, 23 * k, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(W2 / 2, H2 / 2 - 35 * k); g.lineTo(W2 / 2, H2 / 2 + 35 * k); g.moveTo(W2 / 2 - 35 * k, H2 / 2); g.lineTo(W2 / 2 + 35 * k, H2 / 2); g.lineWidth = 2 * k; g.stroke();
    const txt = $('miraTxt').textContent; if (txt) balao(g, txt, W2 / 2, H2 / 2 + 48 * k, k);
    if (!$('iaChip').hidden) balao(g, $('iaChip').textContent, W2 * 0.3, (r.top + r.height + 24) * k, k);
  }
  g.font = `800 ${W2 / 26}px -apple-system, Segoe UI, Arial`; g.fillStyle = 'rgba(255,255,255,.9)'; g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 6; g.fillText('🗺️ Mapear a casa · Decora RA', W2 * 0.04, H2 - H2 * 0.03); g.shadowBlur = 0;
} });

// para testes automáticos e demonstração no PC
window.MAPA = {
  estado, ia, casa: () => casa, executar, vista2d: () => vista2d, modoEditar, mudarParede, exportarPDF, simIr(x, z) { if (simVR) { simVR.x = x; simVR.z = z; } }, abrirPlanta, trocarAba, compartilhar, materiais, calibrar: (c, i) => calibrar(casa.comodos[c], i), vista2d: () => vista2d,
  olhar(yaw, pitch) { estado.pc = true; estado.yaw = yaw; estado.pitch = pitch; },
  mirarEm(x, z) { // aponta a mira para o ponto (x, z) do chão
    const o = origemAtual(), dx = x - o.x, dz = z - o.z;
    estado.pc = true; estado.yaw = (Math.atan2(-dx, -dz) - estado.giro) * r2d; estado.pitch = -Math.atan2(casa.h, Math.hypot(dx, dz)) * r2d;
  },
};
