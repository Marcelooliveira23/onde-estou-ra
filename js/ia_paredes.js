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

const S = 384; // a imagem vai ao modelo em 384×384 (a saída vem em 96×96)
const cv = document.createElement('canvas'); cv.width = cv.height = S;
const g = cv.getContext('2d', { willReadFrequently: true });
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
  return { mapa, W, H, ms: performance.now() - t0 };
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
      out.push({ u: (x + 0.5) / W, v: (y + 1) / H, tipo: porta > H * 0.08 ? 'porta' : janela ? 'janela' : 'parede' });
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
