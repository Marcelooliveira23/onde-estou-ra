/*
 * 🎙️ NARRADOR: "narra os acontecimentos" enquanto você usa o app, para o vídeo ficar explicativo.
 *   · Legendas: cada coisa importante que acontece (chão encontrado, móvel colocado, canto medido,
 *     IA achou a parede…) vira uma legenda curta que EXPLICA a técnica por trás.
 *   · Voz do app (opcional): lê as legendas em voz alta (síntese de voz do iPhone, pt-BR).
 *   · As legendas também entram no vídeo gravado pelo 🎬.
 * O ideal para a nota é VOCÊ narrar com a sua voz: use as legendas como "cola" do que falar.
 */
const CHAVE = 'decora-narrador-v1';
let cfg = { legendas: true, voz: false };
try { Object.assign(cfg, JSON.parse(localStorage.getItem(CHAVE)) || {}); } catch (e) { /* padrão */ }
const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch (e) { /* privado */ } };

const css = document.createElement('style');
css.textContent = `
#legenda { position: fixed; left: 12px; right: 12px; z-index: 55; max-width: 560px; margin: 0 auto; pointer-events: none;
  background: rgba(15,23,42,.88); color: #fff; border-radius: 14px; padding: 9px 12px 9px 40px; font: 600 14.5px/1.38 -apple-system, Segoe UI, Arial, sans-serif;
  box-shadow: 0 6px 20px rgba(0,0,0,.35); transition: opacity .35s, transform .35s; opacity: 0; transform: translateY(8px); }
#legenda.mostra { opacity: 1; transform: none; }
#legenda::before { content: '💬'; position: absolute; left: 12px; top: 8px; font-size: 17px; }
#legenda b { color: #fde68a; }
.narr-op { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-weight: 700; }
.narr-op input { width: 22px; height: 22px; accent-color: #7c3aed; flex: none; }
.narr-op small { display: block; font-weight: 500; color: #64748b; }
`;
document.head.appendChild(css);
const el = document.createElement('div'); el.id = 'legenda'; el.setAttribute('aria-live', 'polite');
document.body.appendChild(el);

let ancora = () => null, timer = 0, ultima = { texto: '', ate: 0 }, repetida = {};
export function ancorarAcima(fn) { ancora = fn; }
function posicionar() {
  const a = ancora(), r = a && !a.hidden && a.getBoundingClientRect();
  el.style.bottom = (r && r.height ? innerHeight - r.top + 10 : 24) + 'px'; el.style.top = 'auto';
}
let voz = null;
function escolherVoz() { const vs = speechSynthesis.getVoices(); voz = vs.find(v => /pt[-_]BR/i.test(v.lang) && /Luciana|Francisca|Google|Felipe/i.test(v.name)) || vs.find(v => /pt[-_]BR/i.test(v.lang)) || vs.find(v => /^pt/i.test(v.lang)) || null; }
if (window.speechSynthesis) { escolherVoz(); speechSynthesis.onvoiceschanged = escolherVoz; }
function falar(txt) {
  if (!window.speechSynthesis) return;
  const limpo = txt.replace(/<[^>]+>/g, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/×/g, ' por ').replace(/÷/g, ' dividido por ').replace(/m²/g, ' metros quadrados').replace(/(\d),(\d)/g, '$1 vírgula $2').replace(/ m\b/g, ' metros').replace(/ cm\b/g, ' centímetros');
  if (speechSynthesis.speaking && speechSynthesis.pending) speechSynthesis.cancel(); // não acumula fila: fala o mais novo
  const u = new SpeechSynthesisUtterance(limpo); u.lang = 'pt-BR'; if (voz) u.voice = voz; u.rate = 1.05; speechSynthesis.speak(u);
}
// narrar(texto, chave): a mesma chave não se repete em menos de 20 s (ex.: girar várias vezes)
export function narrar(html, chave) {
  if (!cfg.legendas && !cfg.voz) return;
  const agora = performance.now();
  if (chave) { if (repetida[chave] && agora - repetida[chave] < 20000) return; repetida[chave] = agora; }
  const dur = Math.min(9000, 2600 + html.replace(/<[^>]+>/g, '').length * 55);
  if (cfg.legendas) {
    el.innerHTML = html; posicionar(); el.classList.add('mostra');
    ultima = { texto: el.textContent, ate: agora + dur };
    clearTimeout(timer); timer = setTimeout(() => el.classList.remove('mostra'), dur);
    clearInterval(posicionar.t); posicionar.t = setInterval(() => { if (!el.classList.contains('mostra')) clearInterval(posicionar.t); else posicionar(); }, 200); // o painel pode crescer depois
  }
  if (cfg.voz) falar(html);
  (window.NARRACOES = window.NARRACOES || []).push(el.textContent || html);
}
export const vozLigada = () => cfg.voz;
// para o gravador: desenha a legenda atual no vídeo, no mesmo lugar da tela
export function desenharLegenda(g, W) {
  if (!cfg.legendas || performance.now() > ultima.ate || !ultima.texto) return;
  const k = W / innerWidth, r = el.getBoundingClientRect(); if (!r.width) return;
  g.save(); g.fillStyle = 'rgba(15,23,42,.88)'; g.beginPath(); g.roundRect(r.left * k, r.top * k, r.width * k, r.height * k, 14 * k); g.fill();
  g.font = `600 ${14.5 * k}px -apple-system, Segoe UI, Arial`; g.fillStyle = '#fff'; g.textBaseline = 'top';
  const larg = (r.width - 52) * k, linhas = []; let lin = '';
  for (const p of ('💬 ' + ultima.texto).split(' ')) { const t = lin ? lin + ' ' + p : p; if (g.measureText(t).width > larg && lin) { linhas.push(lin); lin = p; } else lin = t; }
  linhas.push(lin); linhas.forEach((l, i) => g.fillText(l, (r.left + 12) * k, (r.top + 9) * k + i * 20 * k));
  g.restore();
}
// opções (aparecem na folha do 🎬)
export function opcoesHTML() {
  return `<div class="grav-op"><b class="t">🎙️ Narrar os acontecimentos</b>
    <label class="narr-op"><input type="checkbox" data-n="legendas" ${cfg.legendas ? 'checked' : ''}><span>💬 Legendas explicativas<small>cada acontecimento vira uma legenda que explica a técnica (também entra no vídeo do 🎬)</small></span></label>
    <label class="narr-op"><input type="checkbox" data-n="voz" ${cfg.voz ? 'checked' : ''}><span>🔊 Voz do app lê as legendas<small>opcional. Para a nota, o melhor é <b>você narrar</b> com a sua voz, usando as legendas como cola</small></span></label></div>`;
}
export function ligarOpcoes(raiz) {
  raiz.querySelectorAll('[data-n]').forEach(c => c.addEventListener('change', () => {
    cfg[c.dataset.n] = c.checked; salvar();
    if (c.dataset.n === 'voz' && c.checked) falar('Voz do app ligada. Vou narrar os acontecimentos.'); // o 1º "falar" precisa ser num toque (iPhone)
    if (c.dataset.n === 'voz' && !c.checked && window.speechSynthesis) speechSynthesis.cancel();
  }));
}
window.NARRADOR = { narrar, cfg };
