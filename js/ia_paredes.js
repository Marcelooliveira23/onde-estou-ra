/*
 * VISÃO COMPUTACIONAL NO NAVEGADOR: segmentação semântica da imagem da câmera.
 * Modelo SegFormer-B0 treinado no ADE20K (150 classes de ambientes: parede, piso, teto, porta,
 * janela, sofá, cama…), rodando NO PRÓPRIO CELULAR com transformers.js (ONNX Runtime:
 * WebGPU quando existe, senão WebAssembly). Nenhuma imagem sai do aparelho.
 * Cada pixel da imagem recebe uma classe. O Mapear usa isso para achar SOZINHO onde a parede
 * encontra o chão (o rodapé), as portas e as janelas, enquanto você só gira o celular.
 */
const CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1';
const MODELO = 'Xenova/segformer-b0-finetuned-ade-512-512';
export const C = { parede: 0, predio: 1, ceu: 2, piso: 3, teto: 5, janela: 8, armario: 10, cortina: 18, porta: 14, quadro: 22, tapete: 28, espelho: 27, persiana: 63, tela: 130 };
export const CHAO = new Set([C.piso, C.tapete, 6, 11, 13, 52, 53, 54, 91, 94, 140]); // piso, tapete e superfícies "de chão" (estrada, caminho, pista…)
export const PAREDE = new Set([C.parede, C.predio, C.porta, C.janela, C.cortina, C.quadro, C.espelho, C.persiana, 25 /* house */, 41 /* column */, 43 /* signboard */, 58 /* screen door */]);

let T = null, modelo = null, carregando = null;
export let dispositivo = '';
export function carregar(progresso) {
  if (carregando) return carregando;
  carregando = (async () => {
    T = await import(`${CDN}/dist/transformers.min.js`);
    T.env.allowLocalModels = false;
    const tentar = async (device, dtype) => {
      modelo = await T.AutoModel.from_pretrained(MODELO, { device, dtype, progress_callback: progresso });
      dispositivo = device === 'webgpu' ? 'WebGPU (placa de vídeo)' : 'WebAssembly (processador)';
      tamanho(device === 'webgpu' ? 512 : 384);
    };
    let gpu = false;
    try { gpu = !!(navigator.gpu && await navigator.gpu.requestAdapter()); } catch (e) { gpu = false; }
    if (gpu) { try { await tentar('webgpu', 'fp32'); return modelo; } catch (e) { /* cai para wasm */ } }
    await tentar('wasm', 'q8');
    return modelo;
  })();
  carregando.catch(() => { carregando = null; });
  return carregando;
}
export const pronto = () => !!modelo;

let S = 384; // a imagem vai ao modelo em 384×384 (saída 96×96); com WebGPU, 512×512 (saída 128×128: mais precisa)
const cv = document.createElement('canvas'); cv.width = cv.height = S;
const g = cv.getContext('2d', { willReadFrequently: true });
function tamanho(n) { S = n; cv.width = cv.height = n; }
const MEDIA = [0.485, 0.456, 0.406], DESVIO = [0.229, 0.224, 0.225];
// fonte: vídeo/canvas; (sx, sy, sw, sh): o recorte que aparece na tela
export async function segmentar(fonte, sx, sy, sw, sh) {
  const t0 = performance.now();
  g.drawImage(fonte, sx, sy, sw, sh, 0, 0, S, S);
  const px = g.getImageData(0, 0, S, S).data, N = S * S, d = new Float32Array(3 * N);
  for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) d[k * N + i] = (px[i * 4 + k] / 255 - MEDIA[k]) / DESVIO[k];
  const saida = await modelo({ pixel_values: new T.Tensor('float32', d, [1, 3, S, S]) });
  const lg = saida.logits, [, K, H, W] = lg.dims, L = lg.data, M = H * W, mapa = new Uint8Array(M);
  for (let i = 0; i < M; i++) { // classe de cada pixel = a de maior pontuação
    let m = -1e9, c = 0;
    for (let k = 0; k < K; k++) { const v = L[k * M + i]; if (v > m) { m = v; c = k; } }
    mapa[i] = c;
  }
  return { mapa, W, H, L, K, ms: performance.now() - t0 };
}
// Borda "sub-pixel": entre a última linha de parede (y) e a primeira de chão (y+1), a fronteira fica onde
// (pontuação de parede − pontuação de chão) passa por zero. Interpolando, a medida fica ~5x mais fina.
function fronteira(r, x, y) {
  const { L, K, W, H } = r; if (!L) return (y + 1) / H;
  const M = W * H, melhor = (i, conj) => { let m = -1e9; for (const k of conj) if (k < K) m = Math.max(m, L[k * M + i]); return m; };
  const d0 = melhor(y * W + x, PAREDE) - melhor(y * W + x, CHAO), d1 = melhor((y + 1) * W + x, PAREDE) - melhor((y + 1) * W + x, CHAO);
  const f = d0 > 0 && d1 < 0 ? d0 / (d0 - d1) : 0.5;
  return (y + 0.5 + f) / H;
}

// Rodapés: em cada coluna da imagem, o ponto mais baixo onde há PAREDE (ou porta/janela) com CHÃO logo abaixo.
// Devolve [{u, v, tipo}] em coordenadas 0..1 da imagem (u → direita, v → baixo).
export function rodapes(r, colunas = 48) {
  const { mapa, W, H } = r, out = [];
  for (let k = 0; k < colunas; k++) {
    const x = Math.min(W - 1, Math.round((k + 0.5) / colunas * W));
    let janela = false; // dentro de casa, céu ou árvore visível = janela
    for (let y = 0; y < H; y++) { const c = mapa[y * W + x]; if (c === C.janela || c === C.ceu || c === 4) { janela = true; break; } }
    for (let y = H - 3; y > 1; y--) {
      const c = mapa[y * W + x];
      if (!PAREDE.has(c)) continue;
      if (!CHAO.has(mapa[(y + 1) * W + x]) || !CHAO.has(mapa[(y + 2) * W + x])) continue;
      // o que está logo acima também é parede? (evita ruído de 1 pixel)
      if (!PAREDE.has(mapa[(y - 1) * W + x])) continue;
      let chao = 0; for (let yy = y + 1; yy < H; yy++) if (CHAO.has(mapa[yy * W + x])) chao++;
      if (chao < (H - y - 1) * 0.6) continue; // abaixo do rodapé tem que ser (quase) só chão
      let porta = 0; for (let yy = y; yy > Math.max(0, y - H * 0.25); yy--) if (mapa[yy * W + x] === C.porta) porta++;
      out.push({ u: (x + 0.5) / W, v: fronteira(r, x, y), tipo: porta > H * 0.08 ? 'porta' : janela ? 'janela' : 'parede' });
      break;
    }
  }
  return out;
}
// mapa colorido (para mostrar o que a IA está vendo)
const CORES = { [C.parede]: [250, 204, 21], [C.piso]: [34, 197, 94], [C.tapete]: [34, 197, 94], [C.teto]: [148, 163, 184], [C.porta]: [249, 115, 22], [C.janela]: [14, 165, 233] };
export function pintarMapa(r, ctx, w, h) {
  const { mapa, W, H } = r, img = ctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) { const c = CORES[mapa[i]] || [168, 85, 247]; img.data.set([c[0], c[1], c[2], CORES[mapa[i]] ? 170 : 40], i * 4); }
  const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; tmp.getContext('2d').putImageData(img, 0, 0);
  ctx.clearRect(0, 0, w, h); ctx.imageSmoothingEnabled = true; ctx.drawImage(tmp, 0, 0, w, h);
}

// ---------- 🛋️ MÓVEIS JÁ EXISTENTES NO CÔMODO ----------
// Classes de móveis "de chão" do ADE20K → nome, ícone, móvel equivalente do catálogo, profundidade típica (m)
// e se o tampo serve de APOIO para enfeites (vaso em cima da mesa, porta-retrato na cômoda…).
export const MOVEIS = {
  7: { nome: 'Cama', ic: '🛏️', tipo: 'cama_casal', prof: 2.0 },
  10: { nome: 'Armário', ic: '🗄️', tipo: 'aparador', prof: 0.5, apoio: true },
  15: { nome: 'Mesa', ic: '🍽️', tipo: 'mesa_jantar', prof: 0.9, apoio: true },
  19: { nome: 'Cadeira', ic: '🪑', tipo: 'cadeira_jantar', prof: 0.5 },
  23: { nome: 'Sofá', ic: '🛋️', tipo: 'sofa_moderno', prof: 0.9 },
  24: { nome: 'Prateleira', ic: '📚', tipo: 'estante', prof: 0.35, apoio: true },
  30: { nome: 'Poltrona', ic: '💺', tipo: 'poltrona_moderna', prof: 0.85 },
  31: { nome: 'Assento', ic: '🪑', tipo: 'puff', prof: 0.6 },
  33: { nome: 'Escrivaninha', ic: '🖥️', tipo: 'escrivaninha', prof: 0.7, apoio: true },
  35: { nome: 'Guarda-roupa', ic: '🚪', tipo: 'guarda_roupa', prof: 0.6 },
  37: { nome: 'Banheira', ic: '🛁', tipo: 'banheira', prof: 0.75 },
  44: { nome: 'Cômoda', ic: '🗄️', tipo: 'comoda_classica', prof: 0.55, apoio: true },
  45: { nome: 'Balcão', ic: '🧱', tipo: 'balcao_cozinha', prof: 0.6, apoio: true },
  50: { nome: 'Geladeira', ic: '🧊', tipo: 'geladeira', prof: 0.7 },
  62: { nome: 'Estante', ic: '📚', tipo: 'estante_livros', prof: 0.4, apoio: true },
  64: { nome: 'Mesa de centro', ic: '☕', tipo: 'mesa_centro_moderna', prof: 0.6, apoio: true },
  65: { nome: 'Vaso sanitário', ic: '🚽', tipo: 'vaso_sanitario', prof: 0.65 },
  69: { nome: 'Banco', ic: '🪑', tipo: 'banqueta', prof: 0.45 },
  70: { nome: 'Bancada', ic: '🧱', tipo: 'balcao_cozinha', prof: 0.6, apoio: true },
  71: { nome: 'Fogão', ic: '🔥', tipo: 'fogao', prof: 0.6 },
  73: { nome: 'Ilha de cozinha', ic: '🧱', tipo: 'balcao_cozinha', prof: 0.9, apoio: true },
  75: { nome: 'Cadeira giratória', ic: '🪑', tipo: 'cadeira_escritorio', prof: 0.6 },
  97: { nome: 'Pufe', ic: '🟫', tipo: 'puff', prof: 0.6 },
  99: { nome: 'Bufê', ic: '🗄️', tipo: 'aparador', prof: 0.5, apoio: true },
  107: { nome: 'Lavadora', ic: '🧺', tipo: 'geladeira', prof: 0.6 },
  110: { nome: 'Banqueta', ic: '🪑', tipo: 'banqueta', prof: 0.45 },
};
// Regiões de móvel na imagem (componentes conectados de uma mesma classe) que ENCOSTAM no chão:
// devolve, em coordenadas 0..1 da imagem, as bordas esquerda/direita, o "pé" (onde toca o chão) e o topo.
// a rede às vezes mistura sofá/cadeira/poltrona (ou mesa/mesa de centro) no mesmo móvel: juntamos por "família"
const FAMILIA = { 19: 'assento', 23: 'assento', 30: 'assento', 31: 'assento', 69: 'assento', 75: 'assento', 97: 'assento', 110: 'assento', 15: 'mesa', 64: 'mesa', 33: 'mesa' };
const fam = c => FAMILIA[c] || 'c' + c;
export function moveis(r, minArea = 0.004) {
  const { mapa, W, H } = r, visto = new Uint8Array(W * H), out = [];
  for (let i0 = 0; i0 < W * H; i0++) {
    if (visto[i0] || !MOVEIS[mapa[i0]]) continue;
    const f0 = fam(mapa[i0]), fila = [i0], pix = [], votos = {}; visto[i0] = 1;
    while (fila.length) {
      const i = fila.pop(), x = i % W, y = (i / W) | 0; pix.push(i); votos[mapa[i]] = (votos[mapa[i]] || 0) + 1;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1])
        if (j >= 0 && !visto[j] && MOVEIS[mapa[j]] && fam(mapa[j]) === f0) { visto[j] = 1; fila.push(j); }
    }
    if (pix.length < W * H * minArea) continue;
    const cls = +Object.entries(votos).sort((a, b) => b[1] - a[1])[0][0];
    let x0 = W, x1 = 0, y0 = H; const fundo = new Map(), alto = new Map();
    for (const i of pix) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); fundo.set(x, Math.max(fundo.get(x) ?? -1, y)); alto.set(x, Math.min(alto.get(x) ?? H, y)); }
    if (x1 - x0 < 2) continue;
    // colunas em que logo abaixo do móvel tem chão: é ali que ele está apoiado
    const pes = [...fundo].filter(([x, y]) => y < H - 1 && [1, 2, 3].some(d => y + d < H && CHAO.has(mapa[(y + d) * W + x]))).sort((a, b) => a[0] - b[0]);
    if (pes.length < Math.max(2, (x1 - x0 + 1) * 0.25)) continue; // não toca o chão (TV, quadro, objeto em cima de outro)
    const ys = pes.map(p => p[1]).sort((a, b) => a - b), base = ys[ys.length >> 1];
    const meio = [...alto].filter(([x]) => x > x0 + (x1 - x0) * 0.25 && x < x1 - (x1 - x0) * 0.25).map(p => p[1]).sort((a, b) => a - b);
    const topo = meio.length ? meio[meio.length >> 1] : y0;
    out.push({ cls, ...MOVEIS[cls], grupo: FAMILIA[cls] || null, u0: x0 / W, u1: (x1 + 1) / W, uc: (pes[0][0] + pes[pes.length - 1][0] + 1) / 2 / W, ub0: pes[0][0] / W, ub1: (pes[pes.length - 1][0] + 1) / W, vBase: (base + 1) / H, vTopo: topo / H, area: pix.length / (W * H) });
  }
  return out;
}
