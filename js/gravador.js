/*
 * 🎬 GRAVADOR: grava o vídeo para o YouTube, com a SUA narração, de três jeitos.
 *   1. Gravação de tela do próprio iPhone (recomendado: é o que o professor pede, "gravar a tela do celular");
 *   2. Aqui no app: a imagem do app (câmera + objetos 3D) vira um vídeo, e o microfone grava a sua voz junto
 *      (canvas.captureStream + getUserMedia + MediaRecorder; no iPhone sai em .mp4);
 *   3. No computador (OBS, Xbox Game Bar, QuickTime).
 * Cada página passa uma função compor(g, W, H) que desenha o quadro do vídeo.
 */
import { opcoesHTML, ligarOpcoes, desenharLegenda, vozLigada, narrar } from './narrador.js';
const CSS = `
.grav-sheet { position: fixed; inset: 0; z-index: 90; background: rgba(15,23,42,.55); display: flex; align-items: flex-end; justify-content: center; }
.grav-caixa { background: #fff; width: min(100%, 560px); max-height: 88vh; overflow-y: auto; border-radius: 20px 20px 0 0; padding: 16px 16px max(16px, env(safe-area-inset-bottom)); font-size: 14px; color: #0f172a; line-height: 1.45; }
.grav-caixa h3 { margin: 0 0 8px; font-size: 18px; }
.grav-op { border: 2px solid #e2e8f0; border-radius: 14px; padding: 10px 12px; margin-top: 10px; }
.grav-op.rec { border-color: #16a34a; }
.grav-op b.t { font-size: 15px; display: block; margin-bottom: 4px; }
.grav-op ol { margin: 4px 0 0; padding-left: 20px; }
.grav-op li { margin: 2px 0; }
.grav-tag { font-size: 11px; font-weight: 800; background: #dcfce7; color: #166534; border-radius: 99px; padding: 2px 8px; margin-left: 4px; }
.grav-bt { font: inherit; font-weight: 800; font-size: 15px; border: 0; border-radius: 12px; padding: 11px 14px; background: #dc2626; color: #fff; width: 100%; margin-top: 8px; }
.grav-bt.sec { background: #e2e8f0; color: #0f172a; }
.grav-fechar { float: right; border: 0; background: #e2e8f0; border-radius: 99px; width: 32px; height: 32px; font-weight: 800; }
.grav-ind { position: fixed; top: calc(max(10px, env(safe-area-inset-top)) + 58px); left: 50%; transform: translateX(-50%); z-index: 95; background: #dc2626; color: #fff; font-weight: 800; font-size: 14px;
  border-radius: 99px; padding: 7px 14px; display: flex; gap: 10px; align-items: center; box-shadow: 0 4px 16px rgba(0,0,0,.35); }
.grav-ind i { width: 10px; height: 10px; border-radius: 50%; background: #fff; animation: gravPisca 1s infinite; }
.grav-ind button { border: 0; background: #fff; color: #dc2626; font-weight: 900; border-radius: 99px; padding: 3px 10px; font-size: 13px; }
.grav-nivel { width: 46px; height: 6px; background: rgba(255,255,255,.35); border-radius: 3px; overflow: hidden; }
.grav-nivel span { display: block; height: 100%; background: #fff; width: 0; }
@keyframes gravPisca { 50% { opacity: .2; } }
.grav-video { width: 100%; max-height: 50vh; border-radius: 12px; background: #000; margin-top: 8px; }
.grav-dica { font-size: 12.5px; color: #475569; margin-top: 8px; }
`;
let cssOk = false;
function estilo() { if (cssOk) return; cssOk = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }

// desenha um vídeo/canvas cobrindo a área (igual ao object-fit: cover)
export function cobrir(g, fonte, W, H) {
  const vw = fonte.videoWidth || fonte.width, vh = fonte.videoHeight || fonte.height; if (!vw || !vh) return;
  const s = Math.max(W / vw, H / vh); g.drawImage(fonte, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s);
}
// desenha um elemento da página (canvas) no mesmo lugar em que ele aparece na tela
export function noLugar(g, el, W, alpha = 1) {
  if (!el || el.hidden || !el.offsetParent && el.tagName !== 'CANVAS') return;
  const r = el.getBoundingClientRect(), k = W / innerWidth; if (!r.width) return;
  g.save(); g.globalAlpha = alpha; g.drawImage(el, r.left * k, r.top * k, r.width * k, r.height * k); g.restore();
}
// balão de texto (ex.: a medida da mira)
export function balao(g, txt, x, y, k) {
  g.save(); g.font = `800 ${14 * k}px -apple-system, Segoe UI, Arial`; const w = g.measureText(txt).width + 22 * k;
  g.fillStyle = 'rgba(15,23,42,.82)'; g.beginPath(); g.roundRect(x - w / 2, y - 14 * k, w, 28 * k, 14 * k); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x, y); g.restore();
}

export function criarGravador({ compor, nome = 'decora-ra', botaoEm, classeBotao = 'btn-icone' }) {
  estilo();
  const bt = document.createElement('button'); bt.className = classeBotao; bt.title = 'Gravar vídeo com narração'; bt.textContent = '🎬';
  botaoEm.appendChild(bt);
  let rec = null, partes = [], inicio = 0, mic = null, ind = null, analisador = null, laco = 0, telaAtual = null;
  const podeTela = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !/Android|iPhone|iPad|iPod/.test(navigator.userAgent);
  const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const podeGravar = !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream);

  function folha(html) {
    const f = document.createElement('div'); f.className = 'grav-sheet';
    f.innerHTML = `<div class="grav-caixa"><button class="grav-fechar">✕</button>${html}</div>`;
    f.addEventListener('click', e => { if (e.target === f || e.target.closest('.grav-fechar')) f.remove(); });
    document.body.appendChild(f); return f;
  }
  const AJUDA = 'decora-grav-ajuda-v1';
  bt.addEventListener('click', () => {
    if (rec) return parar();
    let viu = false; try { viu = !!localStorage.getItem(AJUDA); localStorage.setItem(AJUDA, '1'); } catch (e) { /* privado */ }
    if (viu) return comecar(); // 1 toque: já começa a gravar, com a sua voz
    abrirAjuda();
  });
  function abrirAjuda() {
    const f = folha(`<h3>🎬 Gravar o vídeo para o YouTube</h3>
      <p class="grav-dica" style="margin-top:0">A faculdade pede: <b>gravar a tela do celular com o app funcionando</b>, vídeo <b>explicativo</b>, <b>sem música</b>, no YouTube, com o link no AVA. <a href="entrega.html">📋 Checklist da entrega</a></p>
      ${opcoesHTML()}
      <div class="grav-op rec"><b class="t">📱 1. Gravação de tela do iPhone <span class="grav-tag">recomendado</span></b>
        É o que o professor pede: <b>gravar a tela do celular</b> com o app funcionando, com a sua voz.
        <ol><li><b>Ajustes › Central de Controle</b> → adicione <b>Gravação de Tela</b> (só na 1ª vez).</li>
        <li>Abra a Central de Controle (deslize do canto superior direito) e <b>toque e segure</b> o botão ⏺️.</li>
        <li>Toque em <b>Microfone</b> até ficar <b>vermelho (ativado)</b> → <b>Iniciar Gravação</b>. <b>Só na 1ª vez:</b> o iPhone <b>lembra o microfone ligado</b>. Das próximas vezes, <b>um toque simples</b> no ⏺️ já grava com a sua voz (confira o ícone 🎙️ vermelho).</li>
        <li>Volte ao app e use narrando. Para parar: toque no <b>relógio/pílula vermelha</b> lá em cima → Parar.</li>
        <li>O vídeo vai para o app <b>Fotos</b>.</li></ol></div>
      <p class="grav-dica" style="background:#fef3c7;color:#78350f;border-radius:10px;padding:8px 10px">⚠️ <b>Use UMA das duas</b>: a gravação de tela do iPhone <b>ou</b> o ⏺️ do app. As duas juntas disputam o microfone e o vídeo do iPhone sai <b>sem voz</b>.</p>
      <div class="grav-op"><b class="t">⏺️ 2. Gravar aqui no app (imagem do app + sua voz)</b>
        Grava a câmera com os objetos 3D, sem os botões, e o microfone junto. Bom para trechos "limpos".
        ${podeTela ? '<button class="grav-bt" data-g="tela" style="background:#1d4ed8">🖥️ Gravar a ABA INTEIRA (com os botões) + sua voz</button><p class="grav-dica">No computador: escolha <b>esta aba</b> na janela que abrir.</p>' : ''}
        ${podeGravar ? '<button class="grav-bt" data-g="app">⏺️ Começar a gravar com narração</button><p class="grav-dica">Daqui em diante, <b>um toque no 🎬 já começa a gravar com a sua voz</b> (o microfone liga sozinho). Toque de novo para parar. Esta ajuda fica no <b>?</b> da barra vermelha.</p>' : '<p class="grav-dica">⚠️ Este navegador não grava vídeo. Use a opção 1.</p>'}</div>
      <div class="grav-op"><b class="t">🎧 Alternativas para a narração</b>
        <ol><li><b>AirPods / fone com microfone:</b> a voz fica mais limpa (a Gravação de Tela usa o microfone do fone).</li>
        <li><b>Plano de segurança: colocar a voz DEPOIS</b> (apps grátis no iPhone):
          <br>• <b>iMovie</b> (da Apple, grátis, sem marca d'água): Novo projeto › Filme › escolha o vídeo › Criar Filme › leve a linha branca ao início › 🎙️ <b>Narração</b> › Gravar (conta 3 s) › fale › Parar › Aceitar › Concluído › Compartilhar › Salvar Vídeo.
          <br>• <b>CapCut</b> (grátis): Novo projeto › vídeo › <b>Áudio › Gravar</b> (🎙️) › fale › exporte em 1080p. <b>Não adicione música.</b>
          <br>• <b>InShot</b> (grátis, com marca d'água pequena): Vídeo › <b>Música › Gravar</b> (🎙️).
          <br>• <b>Gravador</b> (app de voz do iPhone): grave a narração vendo o vídeo e importe o áudio no iMovie.
          <br>• No Windows: <b>Clipchamp</b> (grátis) › Gravar › Áudio.</li>
        <li><b>Legendas</b> (acima) ajudam a explicar mesmo nos trechos em que você não fala.</li></ol></div>
      <div class="grav-op"><b class="t">💻 3. No computador</b>
        <ol><li><b>Mac + cabo:</b> QuickTime › Arquivo › Nova Gravação de Filme › na setinha, escolha o <b>iPhone</b> como câmera e o microfone do Mac.</li>
        <li><b>Windows:</b> espelhe o iPhone por AirPlay (programas receptores como LonelyScreen ou 5KPlayer) e grave com <b>OBS Studio</b> (grátis: "Captura de janela" + "Microfone") ou <b>Xbox Game Bar</b> (<b>Win + Alt + R</b>; microfone: <b>Win + Alt + M</b>).</li></ol></div>
      <div class="grav-op"><b class="t">▶️ Subir no YouTube (não listado)</b>
        <ol><li>App <b>YouTube</b> › <b>＋</b> › <b>Enviar um vídeo</b> → escolha o vídeo.</li>
        <li>Título, descrição → <b>Visibilidade: Não listado</b> → Enviar.</li>
        <li>Toque em <b>Compartilhar › Copiar link</b> e cole no <b>AVA Univirtus</b>.</li></ol>
        <p class="grav-dica">🔇 <b>Sem música</b> (o YouTube bloqueia por direitos autorais). Fale perto do microfone, em lugar silencioso. Vídeo em pé é aceito normalmente.</p></div>`);
    ligarOpcoes(f);
    const b = f.querySelector('[data-g="app"]'); if (b) b.addEventListener('click', () => { f.remove(); if (!rec) comecar(); });
    const bTela = f.querySelector('[data-g="tela"]'); if (bTela) bTela.addEventListener('click', () => { f.remove(); if (!rec) comecar('tela'); });
  }

  async function comecar(modo = 'app') {
    if (rec) return;
    // o microfone liga sozinho junto com a gravação (o navegador só pergunta a permissão na 1ª vez)
    // com a "voz do app" ligada, o cancelamento de eco é desligado para o microfone também pegar a voz do app
    try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: !vozLigada(), noiseSuppression: !vozLigada(), autoGainControl: true }, video: false }); }
    catch (e) {
      const dica = iOS ? 'No iPhone: toque em "aA" na barra de endereço > Ajustes do Site > Microfone > Permitir (ou Ajustes > Apps > Safari > Microfone).' : 'Clique no cadeado ao lado do endereço e permita o Microfone.';
      if (!confirm('🎙️ O microfone não foi liberado, então a sua voz NÃO seria gravada.\n\n' + dica + '\n\nOK = gravar só a imagem · Cancelar = liberar o microfone e tentar de novo.')) return; mic = null;
    }
    let fluxo, cv = null, g = null, tela = null;
    if (modo === 'tela') { // computador: grava a aba/janela inteira (com os botões) + a sua voz
      try { tela = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include' }); }
      catch (e) { if (mic) mic.getTracks().forEach(t => t.stop()); mic = null; return; }
      fluxo = new MediaStream(tela.getVideoTracks()); tela.getVideoTracks()[0].addEventListener('ended', parar);
    } else {
      const dpr = Math.min(devicePixelRatio || 1, 2), k = Math.min(dpr, 1920 / Math.max(innerWidth, innerHeight));
      cv = document.createElement('canvas'); cv.width = Math.round(innerWidth * k / 2) * 2; cv.height = Math.round(innerHeight * k / 2) * 2;
      g = cv.getContext('2d');
      fluxo = (cv.captureStream || cv.mozCaptureStream).call(cv, 30);
    }
    telaAtual = tela;
    if (mic) {
      mic.getAudioTracks().forEach(t => fluxo.addTrack(t));
      try { const ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); analisador = ac.createAnalyser(); analisador.fftSize = 256; ac.createMediaStreamSource(mic).connect(analisador); } catch (e) { analisador = null; }
    }
    const tipos = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    const mime = tipos.find(t => MediaRecorder.isTypeSupported(t)) || '';
    try { rec = new MediaRecorder(fluxo, mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : undefined); }
    catch (e) { alert('Não foi possível gravar neste navegador: ' + e.message + '\n\nUse a Gravação de Tela do celular (opção 1).'); if (mic) mic.getTracks().forEach(t => t.stop()); mic = null; if (tela) tela.getTracks().forEach(t => t.stop()); return; }
    partes = []; rec.ondataavailable = e => { if (e.data && e.data.size) partes.push(e.data); };
    rec.onstop = terminar;
    // desenha os quadros do vídeo
    const quadro = () => { if (!rec || !g) return; laco = requestAnimationFrame(quadro); g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height); try { compor(g, cv.width, cv.height); desenharLegenda(g, cv.width); } catch (e) { /* um quadro ruim não para a gravação */ } };
    quadro(); rec.start(1000); inicio = performance.now();
    ind = document.createElement('div'); ind.className = 'grav-ind';
    ind.innerHTML = `<i></i><span>00:00</span>${mic ? '<span class="grav-nivel"><span></span></span>' : '🔇'}<button class="grav-ajuda" title="ajuda">?</button><button>⏹ Parar</button>`;
    ind.querySelector('button:last-child').addEventListener('click', parar); ind.querySelector('.grav-ajuda').addEventListener('click', abrirAjuda); document.body.appendChild(ind);
    bt.textContent = '⏹'; bt.style.background = '#dc2626';
    const buf = new Uint8Array(128);
    const tempo = () => {
      if (!rec) return; requestAnimationFrame(tempo);
      const s = Math.floor((performance.now() - inicio) / 1000); ind.children[1].textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      if (analisador) { analisador.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); ind.querySelector('.grav-nivel span').style.width = Math.min(100, m / 64 * 100) + '%'; }
    };
    tempo();
    window.GRAVANDO = true; narrar('Gravando: <b>câmera + objetos 3D + sua voz</b>. Explique o que está fazendo.', 'gravando');
  }
  function parar() { if (rec && rec.state !== 'inactive') rec.stop(); }
  function terminar() {
    const tipo = (rec && rec.mimeType) || 'video/webm'; cancelAnimationFrame(laco); rec = null; window.GRAVANDO = false;
    if (mic) mic.getTracks().forEach(t => t.stop()); mic = null;
    if (telaAtual) telaAtual.getTracks().forEach(t => t.stop()); telaAtual = null;
    if (ind) ind.remove(); bt.textContent = '🎬'; bt.style.background = '';
    const blob = new Blob(partes, { type: tipo.split(';')[0] }), ext = /mp4/.test(tipo) ? 'mp4' : 'webm';
    const arq = new File([blob], `${nome}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${ext}`, { type: blob.type });
    const url = URL.createObjectURL(blob); window.ULTIMA_GRAVACAO = { tamanho: blob.size, tipo: blob.type, segundos: (performance.now() - inicio) / 1000 };
    const f = folha(`<h3>✅ Vídeo gravado</h3><video class="grav-video" src="${url}" controls playsinline></video>
      <button class="grav-bt" data-g="salvar" style="background:#16a34a">💾 Salvar no celular / compartilhar</button>
      <button class="grav-bt sec" data-g="fora">🗑️ Descartar</button>
      <p class="grav-dica">${(blob.size / 1048576).toFixed(1)} MB · ${ext.toUpperCase()}. No iPhone, escolha <b>Salvar Vídeo</b> para ir ao app Fotos, depois envie pelo app do YouTube como <b>Não listado</b>.${ext === 'webm' && iOS ? '' : ''}</p>`);
    f.querySelector('[data-g="salvar"]').addEventListener('click', async () => {
      try { if (navigator.canShare && navigator.canShare({ files: [arq] })) { await navigator.share({ files: [arq], title: 'Vídeo do projeto' }); return; } } catch (e) { if (e.name === 'AbortError') return; }
      const a = document.createElement('a'); a.href = url; a.download = arq.name; a.click();
    });
    f.querySelector('[data-g="fora"]').addEventListener('click', () => { f.remove(); URL.revokeObjectURL(url); });
  }
  return { comecar, parar, gravando: () => !!rec };
}
