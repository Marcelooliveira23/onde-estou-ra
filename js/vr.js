/*
 * CASA EM REALIDADE VIRTUAL: a planta medida no "Mapear a casa" vira uma casa 3D realista,
 * que dá para MOBILIAR, PINTAR e PERCORRER por dentro.
 *   🏠 Casa       → vista de cima (casa de bonecas), gira com o dedo;
 *   🚶 Passear    → primeira pessoa, na altura dos olhos (1,60 m): joystick, toque no chão para ir,
 *                   e 📱 olhar mexendo o celular (giroscópio = "janela mágica");
 *   👓 Óculos VR  → tela dividida em dois olhos (estereoscopia) para óculos de papelão (Cardboard).
 * Os móveis são os mesmos modelos 3D reais do modo Decorar (fotogrametria, Poly Haven, CC0).
 * Realismo: materiais PBR, mapa de ambiente, sombras do sol entrando pelas janelas, rodapé,
 * batentes, piso com textura gerada em código, modo noite com luminárias acesas.
 * Sem planta salva, abre uma casa de exemplo. Testes: window.VR.
 */
import * as THREE from 'three';
import { OrbitControls } from '../lib/jsm/controls/OrbitControls.js';
import { GLTFLoader } from '../lib/jsm/loaders/GLTFLoader.js';
import { StereoEffect } from '../lib/jsm/effects/StereoEffect.js';
import { criarGravador } from './gravador.js';
import { narrar, ancorarAcima } from './narrador.js';

window.THREE_MOVEIS = THREE; window.GLTFLOADER_MOVEIS = GLTFLoader;
for (const arq of ['js/moveis_proc.js', 'js/moveis.js']) await new Promise((ok, erro) => { const s = document.createElement('script'); s.src = arq; s.onload = ok; s.onerror = erro; document.head.appendChild(s); });
const Moveis = window.Moveis, TIPOS = Moveis.TIPOS;

const $ = id => document.getElementById(id);
const d2r = Math.PI / 180;
const PE_DIREITO = 2.6, ALT_PORTA = 2.1, PEITORIL = 1.0, ALT_JANELA = 2.1, ESP = 0.1, OLHOS = 1.6, RAIO = 0.22;
const CHAVE_PLANTA = 'decora-planta-v1', CHAVE_VR = 'decora-vr-v1';
const fmt = (v, c = 1) => v.toFixed(c).replace('.', ',');
const TINTAS = ['#f4f1ea', '#e5e1da', '#d9c8ae', '#b9b4aa', '#a8b89a', '#8fb1c9', '#c98b67', '#3b4450'];
const PISOS = { madeira: 'Madeira', madeira_escura: 'Madeira escura', porcelanato: 'Porcelanato', marmore: 'Mármore', cimento: 'Cimento queimado' };

// ---------- geometria 2D (mesma do Mapear) ----------
const sub = (a, b) => ({ x: a.x - b.x, z: a.z - b.z });
const add = (a, b) => ({ x: a.x + b.x, z: a.z + b.z });
const mul = (a, k) => ({ x: a.x * k, z: a.z * k });
const dot = (a, b) => a.x * b.x + a.z * b.z;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function areaAss(c) { let s = 0; for (let i = 0; i < c.length; i++) { const j = (i + 1) % c.length; s += c[i].x * c[j].z - c[j].x * c[i].z; } return s / 2; }
function centro(c) {
  const A = areaAss(c); let x = 0, z = 0;
  if (Math.abs(A) < 1e-6) return mul(c.reduce(add, { x: 0, z: 0 }), 1 / c.length);
  for (let i = 0; i < c.length; i++) { const j = (i + 1) % c.length, k = c[i].x * c[j].z - c[j].x * c[i].z; x += (c[i].x + c[j].x) * k; z += (c[i].z + c[j].z) * k; }
  return { x: x / (6 * A), z: z / (6 * A) };
}
function parede(cm, i) {
  const n = cm.cantos.length, a = cm.cantos[i], b = cm.cantos[(i + 1) % n], L = dist(a, b) || 1e-6;
  const u = mul(sub(b, a), 1 / L), s = areaAss(cm.cantos) > 0 ? 1 : -1;
  return { a, b, L, u, n: { x: -u.z * s, z: u.x * s } };
}
function dentro(p, c) { let r = false; for (let i = 0, j = c.length - 1; i < c.length; j = i++) if ((c[i].z > p.z) !== (c[j].z > p.z) && p.x < (c[j].x - c[i].x) * (p.z - c[i].z) / (c[j].z - c[i].z) + c[i].x) r = !r; return r; }
function distSeg(p, a, b) { const e = sub(b, a), L2 = dot(e, e) || 1e-9, t = Math.max(0, Math.min(1, dot(sub(p, a), e) / L2)); return dist(p, add(a, mul(e, t))); }

// ---------- a casa: a planta salva, ou uma casa de exemplo ----------
function casaExemplo() {
  const ab = (cm, tipo, i, t, larg, extra) => { const w = parede(cm, i); cm.aberturas.push(Object.assign({ id: cm.id + cm.aberturas.length, tipo, parede: i, t, larg, p: add(w.a, mul(w.u, t * w.L)) }, extra)); };
  const sala = { id: 'ex-sala', nome: 'Sala', cor: '#fde68a', fechado: true, pe: 2.7, cantos: [{ x: 0, z: 0 }, { x: 4.5, z: 0 }, { x: 4.5, z: 3.6 }, { x: 0, z: 3.6 }], aberturas: [] };
  const coz = { id: 'ex-coz', nome: 'Cozinha', cor: '#bfdbfe', fechado: true, pe: 2.7, cantos: [{ x: 4.5, z: 0 }, { x: 7.5, z: 0 }, { x: 7.5, z: 3.6 }, { x: 4.5, z: 3.6 }], aberturas: [] };
  const qto = { id: 'ex-qto', nome: 'Quarto', cor: '#bbf7d0', fechado: true, pe: 2.7, cantos: [{ x: 0, z: 3.6 }, { x: 3.2, z: 3.6 }, { x: 3.2, z: 6.6 }, { x: 0, z: 6.6 }], aberturas: [] };
  ab(sala, 'janela', 0, 0.5, 1.6); ab(sala, 'passagem', 1, 0.6, 0.9); ab(sala, 'porta', 2, 0.75, 0.8); ab(sala, 'janela', 3, 0.5, 1.2);
  ab(coz, 'passagem', 3, 0.4, 0.9, { entrada: true }); ab(coz, 'janela', 1, 0.5, 1.2);
  ab(qto, 'porta', 0, 1.125 / 3.2, 0.8, { entrada: true }); ab(qto, 'janela', 2, 0.5, 1.4);
  return { h: 1.4, comodos: [sala, coz, qto], exemplo: true };
}
let casa = null;
try { casa = JSON.parse(localStorage.getItem(CHAVE_PLANTA)); } catch (e) { /* sem planta */ }
let comodos = casa && Array.isArray(casa.comodos) ? casa.comodos.filter(c => c.fechado && c.cantos.length >= 3) : [];
if (!comodos.length || new URLSearchParams(location.search).has('exemplo')) { casa = casaExemplo(); comodos = casa.comodos; }
const peDe = cm => cm.pe || casa.pe || PE_DIREITO;
const CASA_ID = comodos[0].id;

// ---------- decoração salva (móveis + acabamentos) ----------
let todos = {};
try { todos = JSON.parse(localStorage.getItem(CHAVE_VR)) || {}; } catch (e) { todos = {}; }
const dados = todos[CASA_ID] || (todos[CASA_ID] = { itens: [], acab: {} });
dados.itens = dados.itens.filter(d => TIPOS[d.tipo]);
// 🛋️ móveis que já existem (reconhecidos pela IA no Mapear) entram como itens "existentes"
dados.importados = dados.importados || {};
for (const cm of comodos) if (cm.existentes && cm.existentes.length && !dados.importados[cm.id]) {
  for (const e of cm.existentes) if (TIPOS[e.tipo]) dados.itens.push({ id: Math.random().toString(36).slice(2, 9), tipo: e.tipo, v: 0, x: e.x, y: 0, z: e.z, rot: e.rot, w: e.w, p: e.p, h: e.h, existente: true, origem: cm.id });
  dados.importados[cm.id] = true;
}
const salvar = () => { try { localStorage.setItem(CHAVE_VR, JSON.stringify(todos)); } catch (e) { /* modo privado */ } };
function acabDe(cm, i) {
  if (!dados.acab[cm.id]) {
    const molhado = /cozinha|banheiro|lavanderia|varanda/i.test(cm.nome);
    dados.acab[cm.id] = { parede: TINTAS[i % 3], piso: molhado ? 'porcelanato' : /sala/i.test(cm.nome) ? 'madeira' : 'madeira_escura' };
  }
  return dados.acab[cm.id];
}

// ---------- renderização ----------
const cv = $('vr');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const ANISO = renderer.capabilities.getMaxAnisotropy();
const cena = new THREE.Scene();
cena.environment = Moveis.ambiente(renderer);
const stereo = new StereoEffect(renderer);

// ---------- texturas de piso geradas em código (1 textura = alguns metros de piso) ----------
const cacheTex = {};
function pintarPiso(nome, g, N) {
  const R = (a, b) => a + Math.random() * (b - a);
  if (nome === 'madeira' || nome === 'madeira_escura') {
    const esc = nome === 'madeira_escura', pxm = N / 2.4, larg = 0.2 * pxm;
    g.fillStyle = esc ? '#4a2f1d' : '#b07c4f'; g.fillRect(0, 0, N, N);
    for (let x = 0; x < N; x += larg) {
      let y = R(-N, 0);
      while (y < N) {
        const comp = R(0.9, 1.8) * pxm, l = esc ? R(18, 30) : R(38, 54), h = esc ? R(18, 26) : R(26, 34);
        for (const yy of [y, y + N, y - N]) { // repete na borda para a textura emendar sem costura
          g.fillStyle = `hsl(${h},${esc ? 42 : 48}%,${l}%)`; g.fillRect(x, yy, larg, comp);
          g.save(); g.beginPath(); g.rect(x, yy, larg, comp); g.clip();
          for (let k = 0; k < 14; k++) { // veios
            g.strokeStyle = `rgba(${esc ? '20,10,5' : '70,40,15'},${R(0.06, 0.18)})`; g.lineWidth = R(0.6, 2.2);
            const x0 = x + R(0, larg); g.beginPath(); g.moveTo(x0, yy);
            g.bezierCurveTo(x0 + R(-6, 6), yy + comp / 3, x0 + R(-6, 6), yy + 2 * comp / 3, x0 + R(-4, 4), yy + comp); g.stroke();
          }
          g.restore();
          g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, yy, larg, 1.5); g.fillRect(x, yy, 1.5, comp);
        }
        y += comp;
      }
    }
    return 2.4;
  }
  if (nome === 'porcelanato') {
    g.fillStyle = '#e4ded4'; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = `rgba(${R(200, 240)},${R(195, 230)},${R(185, 220)},.35)`; g.fillRect(i * N / 2, j * N / 2, N / 2, N / 2);
    }
    for (let k = 0; k < 9000; k++) { g.fillStyle = `rgba(120,110,100,${R(0.03, 0.12)})`; g.fillRect(R(0, N), R(0, N), R(1, 2.5), R(1, 2.5)); }
    g.fillStyle = '#c7bfb2'; for (const p of [0, N / 2]) { g.fillRect(p, 0, 3, N); g.fillRect(0, p, N, 3); }
    return 1.2;
  }
  if (nome === 'marmore') {
    g.fillStyle = '#f3f1ed'; g.fillRect(0, 0, N, N);
    for (let k = 0; k < 26; k++) {
      g.strokeStyle = `rgba(110,110,120,${R(0.08, 0.3)})`; g.lineWidth = R(0.6, 3.5);
      let x = R(0, N), y = R(0, N); g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 6; s++) { const nx = x + R(-90, 160), ny = y + R(-60, 140); g.quadraticCurveTo(x + R(-60, 60), y + R(-60, 60), nx, ny); x = nx; y = ny; }
      g.stroke();
    }
    g.fillStyle = 'rgba(150,150,150,.6)'; for (const p of [0, N / 2]) { g.fillRect(p, 0, 2, N); g.fillRect(0, p, N, 2); }
    return 1.6;
  }
  // cimento queimado
  g.fillStyle = '#8e8c87'; g.fillRect(0, 0, N, N);
  for (let k = 0; k < 220; k++) {
    const x = R(0, N), y = R(0, N), r = R(20, 140), gr = g.createRadialGradient(x, y, 0, x, y, r), c = R(0, 1) > 0.5 ? '255,255,255' : '40,40,40';
    gr.addColorStop(0, `rgba(${c},${R(0.03, 0.09)})`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  return 2;
}
function texPiso(nome) {
  if (cacheTex[nome]) return cacheTex[nome];
  const N = 1024, c = document.createElement('canvas'); c.width = c.height = N;
  const metros = pintarPiso(nome, c.getContext('2d'), N);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / metros, 1 / metros); t.anisotropy = ANISO; t.userData.canvas = c;
  return (cacheTex[nome] = t);
}
const BRILHO = { madeira: 0.55, madeira_escura: 0.45, porcelanato: 0.25, marmore: 0.12, cimento: 0.7 };
function texCeu(noite) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  if (noite) { gr.addColorStop(0, '#0b1026'); gr.addColorStop(0.7, '#1e2a4a'); gr.addColorStop(1, '#2a2f3a'); }
  else { gr.addColorStop(0, '#5ea8e8'); gr.addColorStop(0.62, '#cfe6f7'); gr.addColorStop(0.66, '#7fa36b'); gr.addColorStop(1, '#5b7f4c'); }
  g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
  if (noite) for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(255,255,255,${Math.random()})`; g.fillRect(Math.random() * 64, Math.random() * 150, 1, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const CEU = { dia: texCeu(false), noite: texCeu(true) };

// ---------- construção da casa 3D ----------
const casaG = new THREE.Group(); cena.add(casaG);
const pisos = [], paredesMesh = [], soDentro = [], lampadas = [], plafons = [], ceus = [], segSolidos = [], vaosPassar = [];
const matParede = {}, matPiso = {};
const matBranco = new THREE.MeshStandardMaterial({ color: '#f8f8f6', roughness: 0.6 });
const matTeto = new THREE.MeshStandardMaterial({ color: '#fbfbf9', roughness: 1 });
const matVidro = new THREE.MeshPhysicalMaterial({ color: '#dbeafe', transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0, depthWrite: false });
const matMadeira = new THREE.MeshStandardMaterial({ color: '#8a5a33', roughness: 0.55 });
const matMetal = new THREE.MeshStandardMaterial({ color: '#d4d4d8', roughness: 0.25, metalness: 0.9 });
const matPedra = new THREE.MeshStandardMaterial({ color: '#d6d3d1', roughness: 0.4 });
const matCeu = new THREE.MeshBasicMaterial({ map: CEU.dia, toneMapped: false });

// corte = true: "casa de bonecas", paredes cortadas a 1,25 m para ver os móveis de cima
let cortada = null, luzPronta = false;
function construir(corte) {
  cortada = corte;
  casaG.traverse(o => { if (o.geometry) o.geometry.dispose(); }); casaG.clear();
  for (const l of [pisos, paredesMesh, soDentro, lampadas, plafons, ceus, segSolidos, vaosPassar]) l.length = 0;
  comodos.forEach((cm, idx) => {
    const ac = acabDe(cm, idx), PD = peDe(cm), AJ = Math.min(ALT_JANELA, PD - 0.15), AP = Math.min(ALT_PORTA, PD - 0.1), TOPO = corte ? 1.25 : PD;
    matParede[cm.id] = matParede[cm.id] || new THREE.MeshStandardMaterial({ color: ac.parede, roughness: 0.92 });
    matPiso[cm.id] = matPiso[cm.id] || new THREE.MeshStandardMaterial({ map: texPiso(ac.piso), roughness: BRILHO[ac.piso] });
    // piso
    const piso = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(cm.cantos.map(p => new THREE.Vector2(p.x, -p.z)))), matPiso[cm.id]);
    piso.rotation.x = -Math.PI / 2; piso.receiveShadow = true; piso.userData.comodo = cm; casaG.add(piso); pisos.push(piso);
    // teto + luminária (só aparecem andando por dentro)
    if (!corte) {
    const teto = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(cm.cantos.map(p => new THREE.Vector2(p.x, p.z)))), matTeto);
    teto.rotation.x = Math.PI / 2; teto.position.y = PD; teto.castShadow = true; casaG.add(teto); soDentro.push(teto);
    const c = centro(cm.cantos);
    const plafon = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.05, 32), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff3d6', emissiveIntensity: 0.2 }));
    plafon.position.set(c.x, PD - 0.025, c.z); casaG.add(plafon); soDentro.push(plafon); plafons.push(plafon);
    const luz = new THREE.PointLight('#ffe2b0', 0, 0, 2); luz.position.set(c.x, PD - 0.25, c.z); casaG.add(luz); lampadas.push(luz);
    }
    // paredes, com vãos de portas e janelas
    for (let i = 0; i < cm.cantos.length; i++) {
      const w = parede(cm, i), ang = -Math.atan2(w.u.z, w.u.x), P = s => add(w.a, mul(w.u, s));
      const bloco = (s0, s1, y0, y1, m, esp = ESP, recuo = ESP / 2, lista = null) => {
        y1 = Math.min(y1, TOPO);
        if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return null;
        const b = new THREE.Mesh(new THREE.BoxGeometry(s1 - s0, y1 - y0, esp), m), q = add(P((s0 + s1) / 2), mul(w.n, recuo));
        b.position.set(q.x, (y0 + y1) / 2, q.z); b.rotation.y = ang; b.castShadow = b.receiveShadow = m !== matVidro;
        b.userData.comodo = cm; casaG.add(b); if (lista) lista.push(b); return b;
      };
      const parte = (s0, s1, y0, y1) => bloco(s0, s1, y0, y1, matParede[cm.id], ESP, ESP / 2, paredesMesh);
      const vaos = cm.aberturas.filter(a => a.parede === i).map(a => ({ a, s0: a.t * w.L - a.larg / 2, s1: a.t * w.L + a.larg / 2 })).sort((p, q) => p.s0 - q.s0);
      let s = 0;
      const solido = (s0, s1) => { if (s1 - s0 > 0.01) segSolidos.push([P(s0), P(s1)]); };
      for (const v of vaos) {
        parte(s, v.s0, 0, PD); bloco(s, v.s0, 0, 0.08, matBranco, ESP + 0.024); solido(s, v.s0);
        const t = v.a.tipo, m = 0.06; // m = largura do batente/caixilho
        if (t === 'janela') {
          parte(v.s0, v.s1, 0, PEITORIL); parte(v.s0, v.s1, AJ, PD); solido(v.s0, v.s1);
          bloco(v.s0, v.s1, 0, 0.08, matBranco, ESP + 0.024);
          bloco(v.s0 - 0.05, v.s1 + 0.05, PEITORIL - 0.03, PEITORIL, matPedra, ESP + 0.08, ESP / 2); // peitoril de pedra
          for (const [a0, a1, b0, b1] of [[v.s0, v.s0 + m, PEITORIL, AJ], [v.s1 - m, v.s1, PEITORIL, AJ], [v.s0, v.s1, PEITORIL, PEITORIL + m], [v.s0, v.s1, AJ - m, AJ], [(v.s0 + v.s1) / 2 - 0.02, (v.s0 + v.s1) / 2 + 0.02, PEITORIL, AJ]])
            bloco(a0, a1, b0, b1, matBranco, 0.06, ESP / 2);
          bloco(v.s0, v.s1, PEITORIL, AJ, matVidro, 0.01, ESP / 2);
          // a paisagem lá fora (céu e grama), um pouco afastada da janela
          if (!corte) {
          const ceu = new THREE.Mesh(new THREE.PlaneGeometry(v.a.larg + 3, 4), matCeu), q = add(P((v.s0 + v.s1) / 2), mul(w.n, -1.6));
          ceu.position.set(q.x, 1.6, q.z); ceu.rotation.y = ang; casaG.add(ceu); soDentro.push(ceu); ceus.push(ceu);
          }
        } else {
          parte(v.s0, v.s1, AP, PD);
          vaosPassar.push(add(P((v.s0 + v.s1) / 2), mul(w.n, ESP / 2)));
          for (const [a0, a1, b0, b1] of [[v.s0 - m, v.s0, 0, AP + m], [v.s1, v.s1 + m, 0, AP + m], [v.s0 - m, v.s1 + m, AP, AP + m]])
            bloco(a0, a1, b0, b1, t === 'porta' ? matMadeira : matBranco, ESP + 0.03); // batente / guarnição
          if (t === 'porta' && !v.a.entrada && !corte) { // folha da porta entreaberta + maçaneta
            const dir = add(mul(w.u, Math.cos(1.25)), mul(w.n, Math.sin(1.25))), h0 = add(P(v.s0), mul(w.n, ESP)), dob = new THREE.Group();
            const folha = new THREE.Mesh(new THREE.BoxGeometry(v.a.larg - 0.03, AP - 0.02, 0.035), matMadeira);
            folha.position.set((v.a.larg - 0.03) / 2, (AP - 0.02) / 2, 0); folha.castShadow = folha.receiveShadow = true; dob.add(folha);
            const mac = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 10), matMetal); mac.position.set(v.a.larg - 0.1, 1.0, 0.04); dob.add(mac);
            const mac2 = mac.clone(); mac2.position.z = -0.04; dob.add(mac2);
            dob.position.set(h0.x, 0, h0.z); dob.rotation.y = -Math.atan2(dir.z, dir.x); casaG.add(dob);
          }
        }
        s = Math.max(s, v.s1);
      }
      parte(s, w.L, 0, PD); bloco(s, w.L, 0, 0.08, matBranco, ESP + 0.024); solido(s, w.L);
    }
  });
  if (luzPronta) aplicarLuz();
}
function limites() {
  const p = comodos.flatMap(c => c.cantos);
  return { x0: Math.min(...p.map(q => q.x)), x1: Math.max(...p.map(q => q.x)), z0: Math.min(...p.map(q => q.z)), z1: Math.max(...p.map(q => q.z)) };
}
construir(true);
{ // terreno em volta
  const B = limites(), tam = Math.max(B.x1 - B.x0, B.z1 - B.z0, 4);
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(tam * 4, tam * 4), new THREE.MeshStandardMaterial({ color: '#9aab8a', roughness: 1 }));
  chao.rotation.x = -Math.PI / 2; chao.position.set((B.x0 + B.x1) / 2, -0.02, (B.z0 + B.z1) / 2); chao.receiveShadow = true; cena.add(chao);
}

// ---------- luz: dia (sol entrando pelas janelas) e noite (luminárias) ----------
const B = limites(), CX = (B.x0 + B.x1) / 2, CZ = (B.z0 + B.z1) / 2, TAM = Math.max(B.x1 - B.x0, B.z1 - B.z0, 4);
const ceuLuz = new THREE.HemisphereLight('#eef5ff', '#e2d9cc', 0.9); cena.add(ceuLuz);
const sol = new THREE.DirectionalLight('#fff1d6', 3.2); sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048); sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.02;
sol.position.set(CX - TAM * 0.9, TAM * 1.0, CZ - TAM * 1.3); sol.target.position.set(CX, 0, CZ);
Object.assign(sol.shadow.camera, { left: -TAM, right: TAM, top: TAM, bottom: -TAM, near: 0.5, far: TAM * 5 }); sol.shadow.camera.updateProjectionMatrix();
cena.add(sol, sol.target);
let noite = false;
function aplicarLuz() {
  const dentroCasa = !cortada; // por dentro, a luz do céu entra menos: compensa com luz ambiente e luminárias
  ceuLuz.intensity = noite ? 0.12 : dentroCasa ? 1.7 : 0.9; sol.intensity = noite ? 0 : 3.2;
  lampadas.forEach(l => { l.intensity = noite ? 9 : 2.5; });
  plafons.forEach(p => { p.material.emissiveIntensity = noite ? 2.5 : 0.2; });
  matCeu.map = noite ? CEU.noite : CEU.dia; matCeu.needsUpdate = true;
  cena.background = new THREE.Color(noite ? '#0b1026' : '#cfe3f3');
  renderer.toneMappingExposure = noite ? 1.25 : 1.05;
  $('btnNoite').textContent = noite ? '☀️' : '🌙';
}
aplicarLuz(); luzPronta = true;
$('btnNoite').addEventListener('click', () => { noite = !noite; aplicarLuz(); narrar(noite ? 'Modo <b>noite</b>: o sol apaga e as luminárias do teto acendem.' : 'Modo <b>dia</b>: o sol entra pelas janelas e projeta sombras.', 'noite'); });

// ---------- câmeras ----------
const camCasa = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
const camAndar = new THREE.PerspectiveCamera(70, 1, 0.05, 200);
const maior = comodos.slice().sort((a, b) => Math.abs(areaAss(b.cantos)) - Math.abs(areaAss(a.cantos)))[0];
const eu = { ...centro(maior.cantos), yaw: 0, pitch: -0.05, alvo: null, giro: false, giroOffset: 0 };
{ // começa olhando para a maior distância livre do cômodo
  let melhor = -1;
  for (let k = 0; k < 16; k++) { const y = k / 16 * 2 * Math.PI, d = { x: -Math.sin(y), z: -Math.cos(y) }; let s = 0.2; while (s < 12 && !colide(add(eu, mul(d, s)))) s += 0.1; if (s > melhor) { melhor = s; eu.yaw = y; } }
}

// pointerdown do app ANTES dos controles, para poder arrastar móveis sem girar a casa
cv.addEventListener('pointerdown', apertar);
const ctrl = new OrbitControls(camCasa, cv);
ctrl.enableDamping = true; ctrl.maxPolarAngle = Math.PI * 0.47; ctrl.minDistance = 2; ctrl.maxDistance = TAM * 4;
{
  const asp = innerWidth / innerHeight, meia = Math.min(Math.atan(Math.tan(22.5 * d2r) * asp), 22.5 * d2r); // a tela em pé é estreita
  const raio = Math.hypot(B.x1 - B.x0, B.z1 - B.z0) / 2 + 0.4, el = 52 * d2r, dd = raio / Math.sin(meia) * 0.95;
  ctrl.target.set(CX, 0.4, CZ); camCasa.position.set(CX + dd * Math.cos(el) * 0.45, dd * Math.sin(el), CZ + dd * Math.cos(el) * 0.9); ctrl.update();
}

let modo = 'casa';
function trocarModo(m) {
  if (m !== modo) narrar({ casa: '<b>Vista da casa</b>: as paredes ficam cortadas para ver os móveis de cima. Arraste para girar.', andar: '<b>Passeio em primeira pessoa</b>, na altura dos olhos: as paredes bloqueiam e as portas deixam passar.', oculos: '<b>Óculos VR</b>: a tela se divide em duas imagens, uma para cada olho (estereoscopia), como num óculos de papelão.' }[m]);
  modo = m;
  for (const [id, mm] of [['mCasa', 'casa'], ['mAndar', 'andar'], ['mOculos', 'oculos']]) $(id).classList.toggle('ativo', mm === m);
  if (cortada !== (m === 'casa')) { construir(m === 'casa'); if (sel) desselecionar(); }
  if (m === 'andar' && !$('painel').classList.contains('fechado')) { $('painel').classList.add('fechado'); $('tOcultar').textContent = '▴'; }
  $('joy').hidden = m !== 'andar'; $('btnGiro').hidden = m !== 'andar';
  document.body.classList.toggle('oculos', m === 'oculos'); $('sairVr').hidden = m !== 'oculos';
  if (m !== 'oculos') { $('dicaOculos').hidden = true; renderer.setScissorTest(false); ajustar(); }
  itensG.children.forEach(w => { w.visible = !(m === 'casa' && escondidoNaCasa(w.userData.d)); });
  $('btnAuto').textContent = m === 'casa' ? '✨ Mobiliar a casa toda' : '✨ Mobiliar este cômodo';
  eu.alvo = null; desselecionar(); posJoy(); textoInfo();
}
$('mCasa').addEventListener('click', () => trocarModo('casa'));
$('mAndar').addEventListener('click', () => trocarModo('andar'));
$('mOculos').addEventListener('click', () => { trocarModo('oculos'); $('dicaOculos').hidden = false; });
$('okOculos').addEventListener('click', async () => { $('dicaOculos').hidden = true; await ligarGiro(true); });
$('sairVr').addEventListener('click', () => { ligarGiro(false); trocarModo('andar'); });

// ---------- giroscópio: olhar mexendo o celular ----------
let orient = null, ouvindo = false;
const qAjuste = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)), qTela = new THREE.Quaternion(), qY = new THREE.Quaternion(), eul = new THREE.Euler();
const EIXO_Y = new THREE.Vector3(0, 1, 0), EIXO_Z = new THREE.Vector3(0, 0, 1), frente = new THREE.Vector3();
async function ligarGiro(sim) {
  if (sim && !ouvindo) {
    try { if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission && await DeviceOrientationEvent.requestPermission() !== 'granted') return; } catch (e) { return; }
    addEventListener('deviceorientation', e => { if (e.beta != null) orient = { a: e.alpha || 0, b: e.beta, g: e.gamma }; });
    ouvindo = true;
  }
  eu.giro = sim; eu.giroOffset = null; $('btnGiro').classList.toggle('ligado', sim);
}
$('btnGiro').addEventListener('click', () => ligarGiro(!eu.giro));
function quatGiro(q) {
  const tela = ((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) * d2r;
  eul.set(orient.b * d2r, orient.a * d2r, -orient.g * d2r, 'YXZ');
  return q.setFromEuler(eul).multiply(qAjuste).multiply(qTela.setFromAxisAngle(EIXO_Z, -tela));
}

// ---------- andar: colisão com as paredes (portas e passagens deixam passar) ----------
function colide(p) {
  for (const [a, b] of segSolidos) if (distSeg(p, a, b) < RAIO) return true;
  if (comodos.some(c => dentro(p, c.cantos))) return false;
  return !vaosPassar.some(v => dist(v, p) < 0.45);
}
function mover(dx, dz) {
  const p = { x: eu.x + dx, z: eu.z + dz };
  if (!colide(p)) { eu.x = p.x; eu.z = p.z; return true; }
  if (!colide({ x: eu.x + dx, z: eu.z })) { eu.x += dx; return true; }
  if (!colide({ x: eu.x, z: eu.z + dz })) { eu.z += dz; return true; }
  return false;
}
const joy = { x: 0, y: 0, id: null };
$('joy').addEventListener('pointerdown', e => { joy.id = e.pointerId; $('joy').setPointerCapture(e.pointerId); mexerJoy(e); e.stopPropagation(); });
$('joy').addEventListener('pointermove', e => { if (joy.id === e.pointerId) mexerJoy(e); });
const soltarJoy = () => { joy.id = null; joy.x = joy.y = 0; $('joy').firstElementChild.style.transform = ''; };
$('joy').addEventListener('pointerup', soltarJoy); $('joy').addEventListener('pointercancel', soltarJoy);
function mexerJoy(e) {
  const r = $('joy').getBoundingClientRect(), R = r.width / 2;
  let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R; const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
  joy.x = x; joy.y = y; $('joy').firstElementChild.style.transform = `translate(${x * 32}px, ${y * 32}px)`;
}
const teclas = new Set();
addEventListener('keydown', e => teclas.add(e.key.toLowerCase())); addEventListener('keyup', e => teclas.delete(e.key.toLowerCase()));
function atualizarAndar(dt) {
  if (eu.giro && orient) {
    quatGiro(camAndar.quaternion);
    if (eu.giroOffset == null) { frente.set(0, 0, -1).applyQuaternion(camAndar.quaternion); eu.giroOffset = eu.yaw - Math.atan2(-frente.x, -frente.z); }
    camAndar.quaternion.premultiply(qY.setFromAxisAngle(EIXO_Y, eu.giroOffset));
    frente.set(0, 0, -1).applyQuaternion(camAndar.quaternion); eu.yaw = Math.atan2(-frente.x, -frente.z);
  } else {
    eul.set(eu.pitch, eu.yaw, 0, 'YXZ'); camAndar.quaternion.setFromEuler(eul);
  }
  const f = { x: -Math.sin(eu.yaw), z: -Math.cos(eu.yaw) }, d = { x: Math.cos(eu.yaw), z: -Math.sin(eu.yaw) };
  let av = -joy.y, lat = joy.x;
  if (teclas.has('w') || teclas.has('arrowup')) av = 1; if (teclas.has('s') || teclas.has('arrowdown')) av = -1;
  if (teclas.has('a')) lat = -1; if (teclas.has('d')) lat = 1;
  if (teclas.has('arrowleft')) eu.yaw += 1.8 * dt; if (teclas.has('arrowright')) eu.yaw -= 1.8 * dt;
  const v = 1.4 * dt;
  if (av || lat) { eu.alvo = null; mover((f.x * av + d.x * lat) * v, (f.z * av + d.z * lat) * v); }
  else if (eu.alvo) {
    const r = sub(eu.alvo, eu), L = Math.hypot(r.x, r.z);
    if (L < 0.08 || !mover(r.x / L * Math.min(L, v * 1.2), r.z / L * Math.min(L, v * 1.2))) eu.alvo = null;
  }
  camAndar.position.set(eu.x, OLHOS, eu.z);
}

// ---------- mobiliar: escolher, colocar, arrastar, girar, apagar ----------
const itensG = new THREE.Group(); cena.add(itensG);
let armado = null, sel = null, helper = null, arrasto = null, toque = null;
function criarItem(d) {
  const w = new THREE.Group(), m = Moveis.criar(d.tipo, d.v || 0), t = TIPOS[d.tipo]; w.add(m); w.userData.d = d; posItem(w); itensG.add(w);
  if (d.w == null) { d.w = t.dim[0]; d.p = t.dim[2]; }
  d.nome = t.nome; d.local = t.local; // a planta (Mapear) desenha o móvel com o nome
  w.visible = !(modo === 'casa' && escondidoNaCasa(d));
  m.userData.pronto.then(() => {
    const cx = new THREE.Box3(); // tamanho real ocupado no chão (sem a sombra), usado para desenhar o móvel na planta
    m.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(w.matrixWorld).invert();
    m.traverse(o => {
      if (!o.isMesh) return;
      if (!o.material.transparent) { o.castShadow = true; o.receiveShadow = true; }
      if (!o.userData.sombra) { o.geometry.computeBoundingBox(); cx.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))); }
    });
    if (!cx.isEmpty()) { const s = cx.getSize(new THREE.Vector3()); d.h = +s.y.toFixed(2); if (Math.abs(s.x - d.w) > 0.02 || Math.abs(s.z - d.p) > 0.02) { d.w = +s.x.toFixed(2); d.p = +s.z.toFixed(2); salvarDepois(); } if (sel === w) selecionar(w); }
  });
  return w;
}
// na vista "casa de bonecas" as paredes estão cortadas a 1,25 m: o que fica acima disso some (lustre, quadro alto, cortina)
function escondidoNaCasa(d) { const t = TIPOS[d.tipo]; return t.local === 'teto' || d.tipo === 'cortina' || (t.local === 'parede' && (d.y || 0) - t.dim[1] / 2 > 1.2); }
let tSalvar = 0; const salvarDepois = () => { clearTimeout(tSalvar); tSalvar = setTimeout(salvar, 400); };
function posItem(w) { const d = w.userData.d; w.position.set(d.x, d.y || 0, d.z); w.rotation.set(0, d.rot || 0, d.rz || 0); } // rz: giro no plano da parede (quadros)
dados.itens.forEach(criarItem);
const catalogo = Moveis.montarCatalogo($('catalogoVr'), id => {
  armado = armado === id ? null : id; catalogo.marcar(armado); desselecionar();
  if (armado && TIPOS[armado].gltf) Moveis.carregarGltf(TIPOS[armado].gltf);
  $('dicaVr').innerHTML = armado ? `<b>${TIPOS[armado].nome}</b>: agora toque ${TIPOS[armado].local === 'parede' ? 'numa <b>parede</b>' : TIPOS[armado].local === 'teto' ? 'no <b>chão</b>, embaixo de onde ele vai ficar pendurado' : 'no <b>chão</b>'} onde quer colocar.` : 'Escolha um móvel e <b>toque no chão</b> (ou na parede, para quadros e relógio).';
});

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const camAtual = () => (modo === 'casa' ? camCasa : camAndar);
function raio(e) {
  const r = cv.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camAtual());
}
const visiveis = l => l.filter(o => o.visible);
function acertoItem() {
  const h = ray.intersectObjects(itensG.children, true)[0]; if (!h) return null;
  let o = h.object; while (o.parent && o.parent !== itensG) o = o.parent; return o;
}
function acertoPiso() { return ray.intersectObjects(pisos, false)[0] || null; }
function acertoParede() {
  const h = ray.intersectObjects(visiveis(paredesMesh), false)[0]; if (!h || !h.face) return null;
  const n = h.face.normal.clone().transformDirection(h.object.matrixWorld); n.y = 0; n.normalize();
  if (n.dot(ray.ray.direction) > 0) n.negate();
  return { p: h.point, n, comodo: h.object.userData.comodo };
}
function colocarEm(tipo, e) {
  const t = TIPOS[tipo], cam = camAtual();
  if (t.local === 'parede') {
    const h = acertoParede(); if (!h) return null;
    const PD = peDe(h.comodo);
    return { tipo, v: 0, x: h.p.x + h.n.x * 0.004, y: t.alturaCentro ? Math.min(t.alturaCentro, PD - t.dim[1] / 2 - 0.02) : Math.max(0.9, Math.min(PD - 0.35, h.p.y)), z: h.p.z + h.n.z * 0.004, rot: Math.atan2(h.n.x, h.n.z) };
  }
  const h = acertoPiso(); if (!h) return null;
  if (t.local === 'teto') return { tipo, v: 0, x: h.point.x, y: peDe(h.object.userData.comodo) - 0.01, z: h.point.z, rot: 0 };
  return { tipo, v: 0, x: h.point.x, y: 0, z: h.point.z, rot: Math.round(Math.atan2(cam.position.x - h.point.x, cam.position.z - h.point.z) / (Math.PI / 4)) * Math.PI / 4 };
}
function apertar(e) {
  if (modo === 'oculos') { // no óculos: toque = anda 1,2 m para onde está olhando
    const f = { x: -Math.sin(eu.yaw), z: -Math.cos(eu.yaw) }; eu.alvo = add(eu, mul(f, 1.2)); return;
  }
  toque = { x: e.clientX, y: e.clientY, t: performance.now(), yaw: eu.yaw, pitch: eu.pitch, id: e.pointerId };
  raio(e);
  if (sel && acertoItem() === sel) { arrasto = sel; ctrl.enabled = false; cv.setPointerCapture(e.pointerId); }
}
cv.addEventListener('pointermove', e => {
  if (!toque || toque.id !== e.pointerId) return;
  if (arrasto) { // arrasta o móvel pelo chão (ou pela parede)
    raio(e); const d = arrasto.userData.d;
    if (TIPOS[d.tipo].local === 'parede') { const h = acertoParede(); if (h) { d.x = h.p.x + h.n.x * 0.004; d.z = h.p.z + h.n.z * 0.004; if (!TIPOS[d.tipo].alturaCentro) d.y = Math.max(0.9, Math.min(peDe(h.comodo) - 0.35, h.p.y)); d.rot = Math.atan2(h.n.x, h.n.z); } }
    else { const h = acertoPiso(); if (h) { d.x = h.point.x; d.z = h.point.z; } }
    posItem(arrasto); return;
  }
  if (modo === 'andar' && !eu.giro) { // arrastar = olhar em volta
    eu.yaw = toque.yaw + (e.clientX - toque.x) * 0.005;
    eu.pitch = Math.max(-1.2, Math.min(1.0, toque.pitch + (e.clientY - toque.y) * 0.004));
  }
});
addEventListener('pointerup', e => {
  if (!toque || toque.id !== e.pointerId) return;
  const foiToque = Math.hypot(e.clientX - toque.x, e.clientY - toque.y) < 10 && performance.now() - toque.t < 600 && !torcer && dedosVr.size <= 1 && performance.now() - fimTorcao > 400;
  if (arrasto) { if (!foiToque) salvar(); arrasto = null; ctrl.enabled = true; }
  toque = null;
  if (foiToque && e.target === cv) tocar(e);
});
function tocar(e) {
  raio(e);
  if (armado) {
    const d = colocarEm(armado, e);
    if (!d) return aviso(TIPOS[armado].local === 'parede' ? 'Toque numa <b>parede</b>' : 'Toque no <b>chão</b> de um cômodo');
    d.id = Math.random().toString(36).slice(2, 9); dados.itens.push(d); salvar();
    const w = criarItem(d); armado = null; catalogo.marcar(null); selecionar(w);
    narrar(`Pronto: <b>${TIPOS[d.tipo].nome}</b> no lugar. Gire na barra ou com dois dedos, 360°.`, 'vr-colocado');
    $('dicaVr').innerHTML = 'Escolha um móvel e <b>toque no chão</b> (ou na parede, para quadros e relógio).';
    return;
  }
  const it = acertoItem();
  if (it) return selecionar(it);
  if (sel) return desselecionar();
  if (modo === 'andar') { const h = acertoPiso(); if (h) eu.alvo = { x: h.point.x, z: h.point.z }; }
}
function selecionar(w) {
  desselecionar(); sel = w;
  helper = new THREE.BoxHelper(w, '#facc15'); helper.material.depthTest = false; helper.renderOrder = 20; cena.add(helper);
  const t = TIPOS[w.userData.d.tipo], v = w.userData.d.v || 0, jaExiste = w.userData.d.existente ? ' <small>· 🛋️ já existe</small>' : '';
  const dd = w.userData.d, cm = x => Math.round(x * 100), alt = dd.h || t.dim[1];
  $('selNome').innerHTML = `${t.nome}${jaExiste}${t.nomesVar && t.nomesVar[v] ? ` <small>· ${t.nomesVar[v]}</small>` : ''}<br><small>📏 ${t.local === 'parede' ? `${cm(dd.w || t.dim[0])} × ${cm(alt)} cm` : `L ${cm(dd.w || t.dim[0])} × P ${cm(dd.p || t.dim[2])} × A ${cm(alt)} cm`} · ${t.local === 'parede' ? 'arraste pela parede' : 'arraste para mover · 2 dedos giram'}</small>`;
  $('selEncostar').hidden = t.local !== 'chao'; sincronizarGiro();
  narrar(`<b>${t.nome}</b> selecionado: arraste para mover e gire <b>360°</b> pela <b>bolinha azul do anel</b>, com dois dedos ou pela barra.`, 'vr-sel');
  $('selVariar').hidden = t.variantes < 2;
  $('painelNormal').hidden = true; $('selecao').hidden = false; posJoy();
}
function desselecionar() {
  if (helper) { cena.remove(helper); helper.dispose(); helper = null; }
  sel = null; $('painelNormal').hidden = false; $('selecao').hidden = true; posJoy();
}
// ---------- giro livre de 360° (barra, botões de 15° e dois dedos) ----------
const ehParede = d => TIPOS[d.tipo].local === 'parede';
const giroDe = d => (ehParede(d) ? d.rz || 0 : d.rot || 0);
function definirGiro(d, rad) { if (ehParede(d)) d.rz = rad; else d.rot = rad; }
function sincronizarGiro() { if (!sel) return; const g = Math.round(((giroDe(sel.userData.d) * 180 / Math.PI) % 360 + 360) % 360) % 360; $('selFaixa').value = g; $('selGraus').textContent = g + '°'; }
const girarSel = a => { if (!sel) return; const d = sel.userData.d; definirGiro(d, giroDe(d) + a); posItem(sel); sincronizarGiro(); salvarDepois(); };
$('selGirar').addEventListener('click', () => girarSel(-Math.PI / 12));
$('selGirarE').addEventListener('click', () => girarSel(Math.PI / 12));
$('selFaixa').addEventListener('input', e => { if (!sel) return; const d = sel.userData.d; definirGiro(d, +e.target.value * Math.PI / 180); posItem(sel); $('selGraus').textContent = e.target.value + '°'; salvarDepois(); });
// 🧲 encostar: o móvel vai de costas para a parede mais próxima, alinhado com ela
$('selEncostar').addEventListener('click', () => {
  if (!sel) return; const d = sel.userData.d, cm = noComodo(d) || comodos[0]; let melhor = null;
  for (let i = 0; i < cm.cantos.length; i++) { const w = parede(cm, i), t = Math.max(0, Math.min(1, dot(sub(d, w.a), w.u) / w.L)), q = add(w.a, mul(w.u, t * w.L)), di = dist(d, q); if (!melhor || di < melhor.di) melhor = { w, q, di, t }; }
  const { w } = melhor, prof = (d.p || TIPOS[d.tipo].dim[2]) / 2 + 0.02, larg = (d.w || TIPOS[d.tipo].dim[0]) / 2;
  const s = Math.max(larg, Math.min(w.L - larg, melhor.t * w.L)), q = add(add(w.a, mul(w.u, s)), mul(w.n, prof));
  d.x = q.x; d.z = q.z; d.rot = Math.atan2(w.n.x, w.n.z); posItem(sel); sincronizarGiro(); salvar(); aviso('🧲 Encostado na parede'); narrar('<b>Encostar</b>: o móvel foi de costas para a parede mais próxima, já alinhado com ela.', 'encostar');
});
// 🎯 ver de perto: a câmera vai até o móvel
let voo = null;
$('selFocar').addEventListener('click', () => {
  if (!sel) return; const d = sel.userData.d;
  if (modo === 'casa') { const alvo = new THREE.Vector3(d.x, 0.4, d.z), dir = camCasa.position.clone().sub(ctrl.target).normalize(); voo = { t0: performance.now(), de: ctrl.target.clone(), para: alvo, cDe: camCasa.position.clone(), cPara: alvo.clone().addScaledVector(dir, 4.6) }; }
  else { eu.yaw = Math.atan2(-(d.x - eu.x), -(d.z - eu.z)); eu.pitch = -0.35; }
});
// ⬇️ vista de cima (planta "viva"), ótima para arrumar com precisão
$('btnCima').addEventListener('click', () => {
  if (modo !== 'casa') trocarModo('casa');
  const alto = Math.abs(camCasa.position.y - ctrl.target.y) > camCasa.position.distanceTo(ctrl.target) * 0.97;
  const t = alto ? ctrl.target.clone() : new THREE.Vector3(CX, 0, CZ), sx = B.x1 - B.x0 + 1.2, sz = B.z1 - B.z0 + 1.2;
  const mV = 22.5 * d2r, mH = Math.atan(Math.tan(mV) * camCasa.aspect), deitar = (sx > sz) === (camCasa.aspect < 1); // casa "deitada" na tela em pé: gira 90°
  const [lx, lz] = deitar ? [sz, sx] : [sx, sz], dd = Math.max(lx / 2 / Math.tan(mH), lz / 2 / Math.tan(mV) * 1.3, 5);
  voo = { t0: performance.now(), de: ctrl.target.clone(), para: t.clone(), cDe: camCasa.position.clone(), cPara: alto ? t.clone().add(new THREE.Vector3(TAM * 0.8, TAM * 1.3, TAM * 0.9)) : t.clone().add(new THREE.Vector3(deitar ? 0.01 : 0, dd, deitar ? 0 : 0.01)) };
});
function animarVoo(t) {
  if (!voo) return; const k = Math.min(1, (t - voo.t0) / 600), e = k * k * (3 - 2 * k);
  ctrl.target.lerpVectors(voo.de, voo.para, e); camCasa.position.lerpVectors(voo.cDe, voo.cPara, e); if (k >= 1) voo = null;
}
// 🔄 anel de giro: arraste a bolinha azul em volta do móvel (360°)
const anelVr = new THREE.Group(), aroVr = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 72), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false }));
const pegaVr = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), new THREE.MeshBasicMaterial({ color: '#2563eb', depthTest: false }));
aroVr.rotation.x = -Math.PI / 2; aroVr.renderOrder = pegaVr.renderOrder = 20; anelVr.add(aroVr, pegaVr); anelVr.visible = false; cena.add(anelVr);
let girandoVr = false; const planoGiro = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pGiro = new THREE.Vector3();
function atualizarAnelVr() {
  const d = sel && sel.userData.d, ok = d && TIPOS[d.tipo].local === 'chao' && modo !== 'oculos';
  anelVr.visible = !!ok; if (!ok) return;
  const R = Math.max(d.w || 0.6, d.p || 0.6) / 2 + 0.25, th = d.rot || 0;
  anelVr.position.set(d.x, (d.y || 0) + 0.02, d.z); aroVr.scale.setScalar(R); pegaVr.position.set(Math.sin(th) * R, 0, Math.cos(th) * R);
}
cv.addEventListener('pointerdown', e => {
  if (!anelVr.visible || dedosVr.size > 1) return; raio(e);
  if (ray.intersectObjects([aroVr, pegaVr], false).length) { girandoVr = true; ctrl.enabled = false; cv.setPointerCapture(e.pointerId); e.stopImmediatePropagation(); }
}, true);
cv.addEventListener('pointermove', e => {
  if (!girandoVr || !sel) return; raio(e); const d = sel.userData.d; planoGiro.constant = -((d.y || 0) + 0.02);
  if (!ray.ray.intersectPlane(planoGiro, pGiro)) return;
  let th = Math.atan2(pGiro.x - d.x, pGiro.z - d.z); const g = ((th * 180 / Math.PI) % 360 + 360) % 360, perto = Math.round(g / 45) * 45; if (Math.abs(g - perto) < 4) th = perto * Math.PI / 180;
  definirGiro(d, th); posItem(sel); sincronizarGiro(); e.stopImmediatePropagation();
}, true);
addEventListener('pointerup', () => { if (girandoVr) { girandoVr = false; ctrl.enabled = true; fimTorcao = performance.now(); salvarDepois(); } }, true);
// dois dedos no móvel selecionado: giram o móvel (e não a câmera)
const dedosVr = new Map(); let torcer = null, fimTorcao = 0;
cv.addEventListener('pointerdown', e => {
  dedosVr.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (dedosVr.size === 2 && sel) { const [a, b] = [...dedosVr.values()]; torcer = { ang: Math.atan2(b.y - a.y, b.x - a.x), rot: giroDe(sel.userData.d) }; ctrl.enabled = false; arrasto = null; }
}, true);
cv.addEventListener('pointermove', e => {
  if (!dedosVr.has(e.pointerId)) return; dedosVr.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (torcer && sel && dedosVr.size >= 2) {
    const [a, b] = [...dedosVr.values()]; let g = torcer.rot - (Math.atan2(b.y - a.y, b.x - a.x) - torcer.ang);
    const graus = ((g * 180 / Math.PI) % 360 + 360) % 360, perto = Math.round(graus / 45) * 45; if (Math.abs(graus - perto) < 4) g = perto * Math.PI / 180;
    definirGiro(sel.userData.d, g); posItem(sel); sincronizarGiro(); e.stopImmediatePropagation();
  }
}, true);
const soltarVr = e => { dedosVr.delete(e.pointerId); if (dedosVr.size < 2 && torcer) { torcer = null; fimTorcao = performance.now(); ctrl.enabled = true; salvarDepois(); } };
addEventListener('pointerup', soltarVr, true); addEventListener('pointercancel', soltarVr, true);
$('selOk').addEventListener('click', desselecionar);
function trocarItem(w, d) { const i = itensG.children.indexOf(w); itensG.remove(w); const n = criarItem(d); itensG.children.splice(itensG.children.indexOf(n), 1); itensG.children.splice(i, 0, n); return n; }
$('selVariar').addEventListener('click', () => { // 🎨 próxima cor / estampa / obra
  if (!sel) return; const d = sel.userData.d; d.v = ((d.v || 0) + 1) % TIPOS[d.tipo].variantes; salvar(); selecionar(trocarItem(sel, d));
});
$('selDuplicar').addEventListener('click', () => { // ⧉ mais um igual, ao lado
  if (!sel) return; const d0 = sel.userData.d, t = TIPOS[d0.tipo], lado = { x: Math.cos(d0.rot || 0), z: -Math.sin(d0.rot || 0) };
  const d = { ...d0, id: Math.random().toString(36).slice(2, 9), x: d0.x + lado.x * ((d0.w || t.dim[0]) + 0.1), z: d0.z + lado.z * ((d0.w || t.dim[0]) + 0.1) };
  dados.itens.push(d); salvar(); selecionar(criarItem(d));
});
$('selApagar').addEventListener('click', () => {
  if (!sel) return; const d = sel.userData.d;
  dados.itens.splice(dados.itens.indexOf(d), 1); itensG.remove(sel); salvar(); desselecionar();
});

// ---------- ✨ MOBILIAR SOZINHO: um layout para cada tipo de cômodo ----------
// Regras de arquiteto de interiores: móvel encostado em parede SEM porta, passagem livre na frente das
// portas, sofá de frente para a TV, cama com criados-mudos dos dois lados, cortina em toda janela…
function trechos(cm, alto) { // pedaços de parede livres (sem porta; se "alto", também sem janela)
  const r = [];
  for (let i = 0; i < cm.cantos.length; i++) {
    const w = parede(cm, i), vaos = cm.aberturas.filter(a => a.parede === i && (alto || a.tipo !== 'janela'))
      .map(a => [a.t * w.L - a.larg / 2 - (a.tipo === 'janela' ? 0.05 : 0.2), a.t * w.L + a.larg / 2 + (a.tipo === 'janela' ? 0.05 : 0.2)]).sort((a, b) => a[0] - b[0]);
    let s = 0.03;
    for (const [s0, s1] of vaos) { if (s0 - s > 0.3) r.push({ i, w, s0: s, s1: s0 }); s = Math.max(s, s1); }
    if (w.L - 0.03 - s > 0.3) r.push({ i, w, s0: s, s1: w.L - 0.03 });
  }
  return r.map(t => ({ ...t, L: t.s1 - t.s0 })).sort((a, b) => b.L - a.L);
}
function retangulo(d) { // os 4 cantos do móvel no chão
  const c = Math.cos(d.rot || 0), s = Math.sin(d.rot || 0), u = { x: c, z: -s }, f = { x: s, z: c }, a = (d.w || 0.5) / 2, b = (d.p || 0.5) / 2;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => ({ x: d.x + u.x * a * i + f.x * b * j, z: d.z + u.z * a * i + f.z * b * j }));
}
function sobrepoe(A, Bq) { // eixos separadores (dois retângulos girados)
  for (const P of [A, Bq]) for (let i = 0; i < 4; i++) {
    const e = sub(P[(i + 1) % 4], P[i]), n = { x: -e.z, z: e.x };
    const pa = A.map(p => dot(p, n)), pb = Bq.map(p => dot(p, n));
    if (Math.max(...pa) < Math.min(...pb) + 0.02 || Math.max(...pb) < Math.min(...pa) + 0.02) return false;
  }
  return true;
}
function planejar(cm) {
  const novos = [], portas = cm.aberturas.filter(a => a.tipo !== 'janela'), nome = cm.nome.toLowerCase(), PD = peDe(cm);
  const area = Math.abs(areaAss(cm.cantos)), cen = centro(cm.cantos), lista = () => dados.itens.concat(novos);
  const tam = tipo => ({ w: TIPOS[tipo].dim[0], p: TIPOS[tipo].dim[2] });
  const cabe = d => { // dentro do cômodo, longe da frente das portas e sem bater em outro móvel
    const R = retangulo(d); if (TIPOS[d.tipo].local !== 'chao') return true;
    if (!R.every(p => dentro(p, cm.cantos))) return false;
    if (d.tipo !== 'tapete' && portas.some(a => R.some(p => dist(p, a.p) < a.larg / 2 + 0.55) || dist(d, a.p) < a.larg / 2 + 0.6)) return false;
    const junto = (x, y) => /cadeira|banqueta/.test(x) && /mesa/.test(y);
    return !lista().some(o => TIPOS[o.tipo] && TIPOS[o.tipo].local === 'chao' && o.tipo !== 'tapete' && d.tipo !== 'tapete' && !junto(d.tipo, o.tipo) && !junto(o.tipo, d.tipo) && sobrepoe(R, retangulo(o)));
  };
  const por = (tipo, x, z, rot, extra = {}) => { const d = { tipo, v: 0, x, y: 0, z, rot, ...tam(tipo), ...extra }; if (!cabe(d)) return null; novos.push(d); return d; };
  const naParede = (tr, tipo, onde = 0.5, extra = {}) => { // encostado na parede, de frente para o cômodo
    if (!tr) return null; const { w, p } = tam(tipo); if (tr.L < w + 0.02) return null;
    const ideal = typeof onde === 'object' ? Math.max(tr.s0 + w / 2, Math.min(tr.s1 - w / 2, dot(sub(onde, tr.w.a), tr.w.u))) : tr.s0 + w / 2 + (tr.L - w) * onde;
    const opcoes = [ideal]; for (let k = 0.1; k < tr.L; k += 0.1) opcoes.push(ideal - k, ideal + k); // não coube? desliza pela parede
    for (const s of opcoes) {
      if (s < tr.s0 + w / 2 - 1e-6 || s > tr.s1 - w / 2 + 1e-6) continue;
      const q = add(add(tr.w.a, mul(tr.w.u, s)), mul(tr.w.n, p / 2 + 0.03)), d = por(tipo, q.x, q.z, Math.atan2(tr.w.n.x, tr.w.n.z), extra);
      if (d) return d;
    }
    return null;
  };
  const noMeio = (tipo, rot) => { // perto do centro, procurando em espiral um lugar livre
    for (let r = 0; r <= 1.2; r += 0.15) for (let a = 0; a < (r ? 12 : 1); a++) { const d = por(tipo, cen.x + r * Math.cos(a / 12 * 2 * Math.PI), cen.z + r * Math.sin(a / 12 * 2 * Math.PI), rot); if (d) return d; }
    return null;
  };
  const naFrente = (d, tipo, afasta, giro = 0, lado = 0, extra = {}) => { // em frente / ao lado de outro móvel
    if (!d) return null; const f = { x: Math.sin(d.rot), z: Math.cos(d.rot) }, u = { x: Math.cos(d.rot), z: -Math.sin(d.rot) };
    const q = add(add(d, mul(f, afasta)), mul(u, lado)); return por(tipo, q.x, q.z, d.rot + giro, extra);
  };
  const quadroAcima = (d, tipo = 'quadro', y = 1.55, v = 0) => { // na parede, centralizado acima do móvel
    if (!d) return; const f = { x: Math.sin(d.rot), z: Math.cos(d.rot) }, q = add(d, mul(f, -(d.p / 2 + 0.03 - 0.006)));
    const largQ = TIPOS[tipo].dim[0] / 2 + 0.1; // não pendura em cima de janela
    if (cm.aberturas.some(a => a.tipo === 'janela' && Math.abs(dot(sub(a.p, q), f)) < 0.15 && Math.abs(dot(sub(a.p, q), { x: f.z, z: -f.x })) < a.larg / 2 + largQ)) return;
    novos.push({ tipo, v, x: q.x, y: Math.min(y, PD - 0.4), z: q.z, rot: d.rot, ...tam(tipo) });
  };
  const oposto = (tr, lista2) => lista2.filter(t => t !== tr && dot(t.w.n, tr.w.n) < -0.9).sort((a, b) => b.L - a.L)[0];
  const outro = (lista2, ...nao) => lista2.find(t => !nao.some(x => x && x.i === t.i));
  const baixos = trechos(cm, false), altos = trechos(cm, true);
  const existentes = dados.itens.filter(d => d.existente && noComodo(d) === cm);
  if (existentes.length) { // o cômodo JÁ É MOBILIADO: só enfeites (em cima dos móveis, na parede e nos cantos)
    const ENFEITE = { mesa: 'vaso_branco', mesa_centro: 'vaso_alto', aparador: 'vaso_latao', comoda: 'porta_retrato', escrivaninha: 'luminaria_mesa', estante: 'vaso_branco', balcao: null };
    const paraParede = q => { // ponto atrás do móvel → na parede mais próxima (se estiver perto)
      let m = null; for (let i = 0; i < cm.cantos.length; i++) { const w = parede(cm, i), t = Math.max(0, Math.min(1, dot(sub(q, w.a), w.u) / w.L)), p = add(w.a, mul(w.u, t * w.L)), di = dist(q, p); if (!m || di < m.di) m = { p, w, di }; }
      return m && m.di < 0.45 ? { ...add(m.p, mul(m.w.n, 0.006)), rot: Math.atan2(m.w.n.x, m.w.n.z) } : null;
    };
    for (const d of existentes) {
      const chave = Object.keys(ENFEITE).find(k => d.tipo.startsWith(k)), enf = chave && ENFEITE[chave];
      if (enf) novos.push({ tipo: enf, v: 0, x: d.x, y: d.h || TIPOS[d.tipo].dim[1], z: d.z, rot: d.rot, ...tam(enf) }); // em cima do tampo
      if (/sofa|cama|aparador|comoda|escrivaninha/.test(d.tipo)) {
        const f = { x: Math.sin(d.rot), z: Math.cos(d.rot) }, q = paraParede(add(d, mul(f, -(d.p / 2 + 0.05))));
        if (q) novos.push({ tipo: /cama/.test(d.tipo) ? 'quadro' : 'moldura_paisagem', v: /cama/.test(d.tipo) ? 4 : 2, x: q.x, y: Math.min((d.h || 0.8) + 0.65, PD - 0.4), z: q.z, rot: q.rot, ...tam('quadro') });
      }
      if (/sofa/.test(d.tipo)) { naFrente(d, 'tapete', d.p / 2 + 0.7, 0, 0, { v: 1 }); naFrente(d, 'luminaria_piso', 0, 0, d.w / 2 + 0.3) || naFrente(d, 'luminaria_piso', 0, 0, -(d.w / 2 + 0.3)); }
      if (/cama/.test(d.tipo)) naFrente(d, 'tapete', d.p / 2 + 0.25, 0, 0, { v: 3 });
    }
    naParede(baixos[0], 'planta', 1) || naParede(baixos[0], 'planta', 0); naParede(baixos[1], 'suculenta', 0.5);
  }
  // tenta primeiro paredes inteiras (sem janela) e depois as outras, até o móvel caber
  const primeiro = (min, f) => { for (const t of [...altos.filter(t => t.L >= min), ...baixos]) { const d = f(t); if (d) return [d, t]; } return [null, baixos[0]]; };
  if (existentes.length) { /* já mobiliado: só os enfeites (acima) */ } else if (/sala|estar|living/.test(nome)) {
    const [sofa, tr] = primeiro(2.3, t => naParede(t, t.L >= 2.2 ? 'sofa_moderno' : 'sofa_classico', 0.5));
    const tv = sofa && naParede(oposto(tr, altos) || oposto(tr, baixos), 'rack_tv', sofa);
    if (sofa) {
      const dist2 = tv ? Math.hypot(tv.x - sofa.x, tv.z - sofa.z) : 2.6;
      naFrente(sofa, 'tapete', Math.min(1.3, dist2 / 2), 0, 0, { v: 1 });
      naFrente(sofa, 'mesa_centro_moderna', Math.min(sofa.p / 2 + 0.75, dist2 / 2));
      naFrente(sofa, 'poltrona_moderna', sofa.p / 2 + 0.85, Math.PI / 2 + 0.35, sofa.w / 2 + 0.55) || naFrente(sofa, 'poltrona_moderna', sofa.p / 2 + 0.85, -Math.PI / 2 - 0.35, -sofa.w / 2 - 0.55);
      naFrente(sofa, 'luminaria_piso', 0, 0, -(sofa.w / 2 + 0.35)) || naFrente(sofa, 'mesa_lateral', 0, 0, -(sofa.w / 2 + 0.35));
      quadroAcima(sofa, 'quadro', 1.6, 2);
    }
    naParede(outro(baixos, tr, tv && altos.find(t => dot(t.w.n, tr.w.n) < -0.9)), 'planta', 1) || naParede(tr, 'planta', 1);
    naParede(outro(altos, tr), 'estante', 0.5);
  } else if (/quarto|suíte|suite|dormit/.test(nome)) {
    const [cama, tr] = primeiro(2.5, t => naParede(t, t.L >= 2.4 && area >= 7 ? 'cama_casal' : 'cama_solteiro', 0.5));
    if (cama) {
      for (const s of [-1, 1]) naFrente(cama, 'criado_mudo', -(cama.p / 2) + 0.24, 0, s * (cama.w / 2 + 0.33));
      naFrente(cama, 'tapete', 0.35, 0, 0, { v: 3 });
      quadroAcima(cama, 'quadro', 1.55, 4);
    }
    naParede(outro(altos, tr), 'guarda_roupa', 0.5) || naParede(altos.find(t => t.i !== (tr && tr.i) && t.L >= 1.2), 'comoda_classica', 0.5);
    naParede(outro(baixos, tr), 'planta', 1);
  } else if (/cozinha|copa/.test(nome)) {
    const tr = altos[0], bal = naParede(tr, 'balcao_cozinha', 0.15);
    if (bal) { quadroAcima(bal, 'armario_aereo', 1.85); novos[novos.length - 1].p = 0.35; }
    naParede(tr, 'geladeira', 1) || naParede(outro(altos, tr), 'geladeira', 0);
    if (area >= 8.5) {
      const m = noMeio('mesa_jantar', tr ? Math.atan2(tr.w.n.x, tr.w.n.z) + Math.PI / 2 : 0);
      if (m) for (const s of [-1, 1]) for (const l of [-0.42, 0.42]) naFrente(m, 'cadeira_jantar', s * (m.p / 2 + 0.22), s > 0 ? Math.PI : 0, l);
      if (m) novos.push({ tipo: 'pendente', v: 0, x: m.x, y: PD - 0.01, z: m.z, rot: 0, ...tam('pendente') });
    } else {
      const m = noMeio('mesa_bistro', 0); if (m) { naFrente(m, 'banqueta', 0.62); naFrente(m, 'banqueta', -0.62, Math.PI); }
    }
  } else if (/banheiro|lavabo|wc/.test(nome)) {
    const tr = altos[0];
    naParede(tr, area >= 5.5 && tr && tr.L >= 2.6 ? 'banheira' : 'box_chuveiro', 1);
    naParede(tr, 'vaso_sanitario', 0.2) || naParede(outro(altos, tr), 'vaso_sanitario', 0.5);
    const p = naParede(outro(altos, tr), 'pia_banheiro', 0.5) || naParede(tr, 'pia_banheiro', 0);
    if (p) quadroAcima(p, 'espelho_banheiro', 1.55);
  } else if (/escrit|home|estudo/.test(nome)) {
    const tr = baixos[0], mesa = naParede(tr, 'escrivaninha', 0.5);
    if (mesa) naFrente(mesa, 'cadeira_escritorio', mesa.p / 2 + 0.3, Math.PI);
    naParede(outro(altos, tr), 'estante_livros', 0.5); naParede(outro(baixos, tr), 'planta', 1);
    if (mesa) quadroAcima(mesa, 'quadro', 1.5, 6);
  } else if (/varanda|sacada|quintal/.test(nome)) {
    const tr = baixos[0]; naParede(tr, 'cadeira_balanco', 0.3); naParede(tr, 'floreira', 0.85); naParede(outro(baixos, tr), 'planta', 0.5);
  } else {
    naParede(baixos[0], 'aparador', 0.5) || naParede(baixos[0], 'planta', 0.5); naParede(outro(baixos, baixos[0]), 'planta', 1);
    if (baixos[0]) { const q = baixos[0], s = (q.s0 + q.s1) / 2, p = add(add(q.w.a, mul(q.w.u, s)), mul(q.w.n, 0.006)); novos.push({ tipo: 'quadro', v: 3, x: p.x, y: 1.6, z: p.z, rot: Math.atan2(q.w.n.x, q.w.n.z), ...tam('quadro') }); }
  }
  // cortina em toda janela e luz no teto
  for (const a of cm.aberturas.filter(b => b.tipo === 'janela' && !b.sugerida)) {
    const w = parede(cm, a.parede), q = add(a.p, mul(w.n, 0.004));
    novos.push({ tipo: 'cortina', v: 0, x: q.x, y: Math.min(1.3, PD - 1.22), z: q.z, rot: Math.atan2(w.n.x, w.n.z), w: Math.min(a.larg + 0.6, 2.2), p: 0.12 });
  }
  if (!novos.some(d => TIPOS[d.tipo].local === 'teto') && !/banheiro|lavabo/.test(nome)) novos.push({ tipo: /sala/.test(nome) ? 'lustre' : 'pendente', v: 0, x: cen.x, y: PD - 0.01, z: cen.z, rot: 0, ...tam('pendente') });
  return novos;
}
function noComodo(d) { return comodos.find(c => dentro(d, c.cantos)); }
function mobiliarSozinho(lista) {
  let n = 0;
  for (const cm of lista) {
    dados.itens.filter(d => noComodo(d) === cm && !d.existente).forEach(d => { dados.itens.splice(dados.itens.indexOf(d), 1); }); // os móveis que já existem ficam
    for (const d of planejar(cm)) { d.id = Math.random().toString(36).slice(2, 9); dados.itens.push(d); n++; }
  }
  itensG.clear(); dados.itens.forEach(criarItem); desselecionar(); salvar();
  aviso(`✨ ${n} móveis colocados ${lista.length > 1 ? 'na casa toda' : 'no(a) ' + lista[0].nome}`);
  narrar(`<b>${n} móveis</b> colocados sozinhos, com regras de design de interiores: móvel em parede sem porta, passagem livre, sofá de frente para a TV, cama com criados-mudos e cortina nas janelas.`);
  return n;
}
const alvoAuto = () => (modo === 'casa' ? comodos : [comodos.find(c => dentro(eu, c.cantos)) || comodos[0]]);
$('btnAuto').addEventListener('click', () => mobiliarSozinho(alvoAuto()));
$('btnLimpar').addEventListener('click', () => {
  const l = alvoAuto(); if (!confirm(`Tirar todos os móveis ${l.length > 1 ? 'da casa' : 'do(a) ' + l[0].nome}?`)) return;
  dados.itens = dados.itens.filter(d => !l.includes(noComodo(d))); todos[CASA_ID].itens = dados.itens;
  itensG.clear(); dados.itens.forEach(criarItem); desselecionar(); salvar();
});

// ---------- pintar: cor da parede e piso de cada cômodo ----------
let comodoPintar = comodos[0];
function montarPintar() {
  $('chipsComodo').innerHTML = comodos.map(c => `<button data-c="${c.id}" class="${c === comodoPintar ? 'ativo' : ''}">${c.nome}</button>`).join('');
  const ac = dados.acab[comodoPintar.id];
  $('tintas').innerHTML = TINTAS.map(t => `<button data-t="${t}" style="background:${t}" class="${ac.parede === t ? 'ativo' : ''}"></button>`).join('');
  $('pisos').innerHTML = Object.entries(PISOS).map(([k, n]) => `<button data-p="${k}" class="${ac.piso === k ? 'ativo' : ''}"><canvas width="148" height="92"></canvas><span>${n}</span></button>`).join('');
  $('pisos').querySelectorAll('button').forEach(b => { const src = texPiso(b.dataset.p).userData.canvas; b.firstElementChild.getContext('2d').drawImage(src, 0, 0, 512, 320, 0, 0, 148, 92); });
}
$('chipsComodo').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { comodoPintar = comodos.find(c => c.id === b.dataset.c); montarPintar(); } });
$('tintas').addEventListener('click', e => { const b = e.target.closest('button'); if (b) pintar(comodoPintar.id, b.dataset.t); });
$('pisos').addEventListener('click', e => { const b = e.target.closest('button'); if (b) trocarPiso(comodoPintar.id, b.dataset.p); });
function pintar(id, cor) { narrar('Parede <b>pintada</b>: dá para testar as cores antes de comprar a tinta.', 'pintar'); dados.acab[id].parede = cor; matParede[id].color.set(cor); salvar(); montarPintar(); }
function trocarPiso(id, p) { narrar(`Piso trocado para <b>${PISOS[p].toLowerCase()}</b> (textura gerada em código).`, 'piso'); dados.acab[id].piso = p; matPiso[id].map = texPiso(p); matPiso[id].roughness = BRILHO[p]; matPiso[id].needsUpdate = true; salvar(); montarPintar(); }
function abaPainel(qual) {
  $('tMob').classList.toggle('ativo', qual === 'mob'); $('tPintar').classList.toggle('ativo', qual === 'pintar');
  $('corpoMob').hidden = qual !== 'mob'; $('corpoPintar').hidden = qual !== 'pintar'; $('painel').classList.remove('fechado'); $('tOcultar').textContent = '▾';
  if (qual === 'pintar') { if (modo !== 'casa') comodoPintar = comodos.find(c => dentro(eu, c.cantos)) || comodoPintar; montarPintar(); }
  posJoy();
}
$('tMob').addEventListener('click', () => abaPainel('mob'));
$('tPintar').addEventListener('click', () => abaPainel('pintar'));
$('tOcultar').addEventListener('click', () => { const f = $('painel').classList.toggle('fechado'); $('tOcultar').textContent = f ? '▴' : '▾'; posJoy(); });

// ---------- foto ----------
$('btnFoto').addEventListener('click', async () => {
  $('flash').classList.remove('vai'); void $('flash').offsetWidth; $('flash').classList.add('vai');
  const blob = await new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.92)), arq = new File([blob], 'minha-casa-vr.jpg', { type: 'image/jpeg' });
  window.ULTIMA_FOTO_VR = true;
  try { if (navigator.canShare && navigator.canShare({ files: [arq] })) { await navigator.share({ files: [arq], title: 'Minha casa em VR' }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = arq.name; a.click();
});

// ---------- tela ----------
function aviso(html) { $('info').innerHTML = '⚠️ ' + html; clearTimeout(aviso.t); aviso.t = setTimeout(textoInfo, 2200); }
function textoInfo() {
  const area = comodos.reduce((s, c) => s + Math.abs(areaAss(c.cantos)), 0);
  const base = `${casa.exemplo ? '🏡 Casa de exemplo' : '🏠 Sua casa'} · ${comodos.length} cômodo(s) · ${fmt(area)} m²`;
  $('info').innerHTML = modo === 'casa' ? `${base}<br><small>arraste para girar · pinça para zoom</small>`
    : `${(comodos.find(c => dentro(eu, c.cantos)) || {}).nome || base}<br><small>${eu.giro ? 'mexa o celular para olhar' : 'arraste para olhar'} · joystick ou toque no chão para andar</small>`;
}
function posJoy() { $('joy').style.bottom = ($('painel').offsetHeight + 34) + 'px'; }
function ajustar() {
  const W = innerWidth, H = innerHeight;
  renderer.setSize(W, H, false); renderer.setViewport(0, 0, W, H); stereo.setSize(W, H);
  camCasa.aspect = camAndar.aspect = W / H;
  camCasa.setViewOffset(W, H, 0, H * 0.13, W, H); // casa um pouco acima do meio (o painel fica embaixo)
  camCasa.updateProjectionMatrix(); camAndar.updateProjectionMatrix(); posJoy();
}
addEventListener('resize', ajustar);
if (new URLSearchParams(location.search).has('sim')) document.body.classList.add('sim'); // simulador: sem botões
ajustar(); trocarModo(new URLSearchParams(location.search).get('modo') || 'casa');
if (dados.itens.every(d => d.existente) && !dados.autoFeito && !new URLSearchParams(location.search).has('vazia')) { dados.autoFeito = true; mobiliarSozinho(comodos); } // 1ª vez: já mobiliada (ou só os enfeites, se já tem móveis)
$('carregandoVr').hidden = true;
ancorarAcima(() => ($('painel').classList.contains('fechado') ? $('painel') : $('painel')));
narrar(casa.exemplo ? 'Esta é uma <b>casa de exemplo em realidade virtual</b>. Mapeie a sua em 🗺️ Mapear e ela aparece aqui.' : '<b>Realidade virtual:</b> a planta que você mediu com a câmera virou uma casa 3D, com as mesmas medidas.');

let tAnt = performance.now(), comodoAntes = null;
criarGravador({ nome: 'casa-vr', botaoEm: $('lado'), classeBotao: '', compor(g, W2, H2) {
  g.drawImage(cv, 0, 0, W2, H2);
  g.font = `800 ${W2 / 26}px -apple-system, Segoe UI, Arial`; g.fillStyle = 'rgba(255,255,255,.9)'; g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 6; g.fillText('🥽 Casa em VR · Decora RA', W2 * 0.04, H2 - H2 * 0.03); g.shadowBlur = 0;
} });
let externo = null; // simulador do Mapear: a câmera segue a pose do celular simulado
function quadro(t) {
  requestAnimationFrame(quadro);
  const dt = Math.min(0.05, (t - tAnt) / 1000); tAnt = t;
  if (externo) { camAndar.position.set(externo.x, externo.y, externo.z); camAndar.quaternion.set(...externo.q); renderer.render(cena, camAndar); return; }
  if (modo === 'casa') { animarVoo(t); ctrl.update(); renderer.render(cena, camCasa); }
  else {
    atualizarAndar(dt);
    if (modo === 'oculos') stereo.render(cena, camAndar); else renderer.render(cena, camAndar);
    const c = comodos.find(cc => dentro(eu, cc.cantos)); if (c !== comodoAntes) { comodoAntes = c; textoInfo(); }
  }
  if (helper) helper.update();
  atualizarAnelVr();
}
requestAnimationFrame(quadro);

// para testes automáticos
window.VR = {
  dados, eu, comodos, trocarModo, pintar, trocarPiso, abaPainel, aplicarLuz: n => { noite = n; aplicarLuz(); },
  colocar(tipo, x, z, rot = 0) { const d = { id: 't' + dados.itens.length, tipo, v: 0, x, y: 0, z, rot }; dados.itens.push(d); salvar(); return criarItem(d).userData.d; },
  olhar(yaw, pitch) { eu.yaw = yaw; eu.pitch = pitch; }, cam: () => ({ p: camCasa.position.toArray().map(v => +v.toFixed(2)), t: ctrl.target.toArray().map(v => +v.toFixed(2)), TAM }), mobiliarSozinho, planejar, selecionar: i => selecionar(itensG.children[i]), sel: () => sel,
  pose(x, y, z, q, fov, agora) {
    externo = { x, y, z, q }; if (fov && Math.abs(camAndar.fov - fov) > 0.01) { camAndar.fov = fov; camAndar.updateProjectionMatrix(); }
    if (agora) { camAndar.position.set(x, y, z); camAndar.quaternion.set(...q); renderer.render(cena, camAndar); return cv; } // quadro exato desta pose
  },
  andarFrente(seg) { for (let t = 0; t < seg; t += 0.05) mover(-Math.sin(eu.yaw) * 0.07, -Math.cos(eu.yaw) * 0.07); return { x: eu.x, z: eu.z }; },
  pronto: () => Promise.all(itensG.children.map(w => w.children[0].userData.pronto)),
};
