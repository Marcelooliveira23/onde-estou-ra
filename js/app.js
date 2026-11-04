/*
 * Interface do app: tela inicial, início da câmera (MindAR), eventos de
 * placa encontrada/perdida, mini-mapa no canto, escolha de destino, voz,
 * detecção de chegada, rota de emergência até a saída e o modo 🛋️ Decorar.
 * Também funciona no simulador (simulador.html), que dispara os mesmos eventos sem câmera.
 */
(function () {
  const { C, porId, centro, placa, rota, direcao } = window.Casa;
  const $ = id => document.getElementById(id);
  const cena = $('cena');
  const SAIDA = C.comodos.find(k => k.saida);

  const estado = { atual: null, destino: null, vendo: false, voz: false, ultimaFala: '', inicioRota: null, emergencia: false };
  const na = c => (c.artigo === 'o' ? 'no' : 'na') + ' ' + c.nome;
  const ao = c => (c.artigo === 'o' ? 'ao' : 'à') + ' ' + c.nome;

  // ---------- início ----------
  if (!window.isSecureContext) $('avisoHttps').hidden = false;

  $('btnIniciar').addEventListener('click', () => {
    $('capa').hidden = true;
    $('carregando').hidden = false;
    // "destrava" a voz no iOS (precisa ser dentro do toque)
    try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch (e) { /* sem voz */ }
    const iniciar = () => {
      const sis = cena.systems['mindar-image-system'];
      if (sis) sis.start();
      else cena.emit('arReady'); // simulador: não há câmera
    };
    if (cena.hasLoaded) iniciar(); else cena.addEventListener('loaded', iniciar, { once: true });
  });

  let minimapaPronto = false;
  cena.addEventListener('arReady', () => {
    $('carregando').hidden = true;
    $('hud').hidden = false;
    if (minimapaPronto) return; // a câmera foi reativada (voltou do AR do iPhone)
    minimapaPronto = true;
    try { window.Minimapa3D.iniciar($('mapa3d')); } catch (e) { modo3D = false; aplicarModoMapa(); }
  });

  // minimapa: 3D estilo game (padrão) ou planta 2D
  let modo3D = true;
  function aplicarModoMapa() {
    $('mapa3d').hidden = !modo3D;
    $('mapaSvg').hidden = modo3D;
    $('btnModoMapa').textContent = modo3D ? '2D' : '3D';
  }
  $('btnModoMapa').addEventListener('click', () => { modo3D = !modo3D; aplicarModoMapa(); });
  cena.addEventListener('arError', () => {
    $('carregando').innerHTML = '<p>❌ Não foi possível abrir a câmera.<br>No iPhone: Ajustes › Apps › Safari › Câmera › Permitir, e abra pelo endereço <b>https://</b>.</p>';
  });

  // ---------- voz ----------
  $('btnVoz').addEventListener('click', () => {
    estado.voz = !estado.voz;
    $('btnVoz').textContent = estado.voz ? '🔊' : '🔇';
    if (estado.voz) falar(textoFala(), true);
    else try { speechSynthesis.cancel(); } catch (e) { /* */ }
  });
  function falar(t, forcar) {
    if (!estado.voz || !t || (!forcar && t === estado.ultimaFala)) return;
    estado.ultimaFala = t;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(t);
      u.lang = 'pt-BR'; u.rate = 1.05;
      speechSynthesis.speak(u);
    } catch (e) { /* sem voz */ }
  }

  // ---------- aviso de chegada ----------
  let timerAviso;
  function aviso(html, cor) {
    const a = $('aviso');
    a.innerHTML = html;
    a.style.setProperty('--cor', cor || '#16a34a');
    a.hidden = false;
    a.classList.remove('entra'); void a.offsetWidth; a.classList.add('entra');
    clearTimeout(timerAviso);
    timerAviso = setTimeout(() => { a.hidden = true; }, 4500);
  }

  // ---------- placas ----------
  document.querySelectorAll('[data-comodo]').forEach(el => {
    const c = porId[el.dataset.comodo];
    el.addEventListener('targetFound', () => {
      estado.vendo = true;
      if (decorando) { // no modo Decorar a placa só define a parede que está sendo decorada
        estado.atual = c.id;
        window.Decor.trocar(c.id);
        mostrarMaquetes(false);
        atualizar();
        return;
      }
      if (estado.atual !== c.id) {
        const chegou = estado.destino === c.id && estado.atual;
        if (chegou) {
          const seg = estado.inicioRota ? Math.round((Date.now() - estado.inicioRota) / 1000) : null;
          const tempo = seg != null ? ` em ${seg < 60 ? seg + ' s' : Math.floor(seg / 60) + ' min ' + (seg % 60) + ' s'}` : '';
          aviso(`✅ Você chegou ${ao(c)}!<small>Percurso concluído${tempo}</small>`, estado.emergencia ? '#dc2626' : '#16a34a');
          falar(`Você chegou ${ao(c)}.`, true);
          estado.emergencia = false;
          estado.destino = null;
        }
        estado.atual = c.id;
        if (!estado.destino || estado.destino === c.id) estado.destino = C.comodos.find(k => k.id !== c.id).id;
        estado.inicioRota = Date.now();
        if (navigator.vibrate) navigator.vibrate(chegou ? [60, 80, 60] : 60);
      }
      aplicarDestino();
      atualizar();
      setTimeout(() => falar(textoFala()), 1200);
    });
    el.addEventListener('targetLost', () => { estado.vendo = false; atualizar(); });
  });

  function maqueteAtual() {
    const el = document.querySelector(`[data-comodo="${estado.atual}"]`);
    return el && el.components['maquete-casa'];
  }

  function aplicarDestino() {
    const m = maqueteAtual();
    if (m) m.definirDestino(estado.destino, estado.emergencia);
  }

  function escolher(id, emergencia) {
    estado.destino = id;
    estado.emergencia = !!emergencia;
    estado.inicioRota = Date.now();
    aplicarDestino(); atualizar(); falar(textoFala(), true);
  }

  function textoInstrucao() {
    if (!estado.atual || !estado.destino) return null;
    const r = rota(estado.atual, estado.destino, estado.emergencia && SAIDA.porta);
    if (!r) return { html: 'Não há caminho cadastrado até esse cômodo.', fala: '' };
    const d = direcao(estado.atual, r);
    const dest = porId[estado.destino];
    const passa = r.passaPor.length ? ` e atravesse: ${r.passaPor.join(' → ')}` : '';
    const alvo = estado.emergencia ? `a <b>SAÍDA</b> (${dest.nome})` : `<b>${dest.nome}</b>`;
    const prefixo = estado.emergencia ? '🚨 ROTA DE FUGA · ' : '';
    return {
      html: `<span class="seta-txt">${d.emoji}</span> ${prefixo}Para chegar ${estado.emergencia ? 'até ' + alvo : (dest.artigo === 'o' ? 'ao ' : 'à ') + alvo}, ${d.texto}${passa}. Siga a trilha ${estado.emergencia ? 'vermelha' : 'verde'} · <b>≈ ${r.metros.toFixed(0)} m</b>`,
      fala: `${estado.emergencia ? 'Rota de emergência. Para chegar à saída' : 'Para chegar ' + ao(dest)}, ${d.texto}${passa ? ', passando por ' + r.passaPor.join(' e ') : ''}. Cerca de ${r.metros.toFixed(0)} metros.`,
    };
  }
  function textoFala() {
    if (!estado.atual) return '';
    const i = textoInstrucao();
    return `Você está ${na(porId[estado.atual])}. ` + (i ? i.fala : '');
  }

  // ---------- modo Decorar ----------
  let decorando = false;
  function mostrarMaquetes(v) {
    document.querySelectorAll('[data-comodo]').forEach(el => { const m = el.getObject3D('maquete'); if (m) m.visible = v; });
  }
  function decorar(liga) {
    if (liga && !estado.atual) { aviso('🛋️ Aponte para uma placa primeiro<small>Os objetos ficam presos à parede onde a placa está colada.</small>', '#0f172a'); return; }
    decorando = liga;
    document.body.classList.toggle('decorando', liga);
    mostrarMaquetes(!liga);
    if (liga) window.Decor.entrar(estado.atual); else window.Decor.sair();
    $('decor').hidden = !liga;
    atualizar();
  }
  $('btnDecor').addEventListener('click', () => decorar(!decorando));
  $('btnDecorFim').addEventListener('click', () => decorar(false));

  // ---------- AR nativo do iPhone (AR Quick Look, arquivos .usdz) ----------
  const temQuickLook = (() => { try { return document.createElement('a').relList.supports('ar'); } catch (e) { return false; } })();
  $('qlLista').innerHTML = Object.values(window.Moveis.TIPOS).map(t =>
    `<a class="ql-item" rel="ar" href="modelos/usdz/${t.id}.usdz#allowsContentScaling=0"><img src="${t.foto}" alt="" loading="lazy"><span><b>${t.nome}</b><small>${t.local === 'parede' ? 'na parede' : 'no chão'}</small></span></a>`).join('');
  $('qlAviso').hidden = temQuickLook;
  document.querySelectorAll('.ql-item').forEach(a => a.addEventListener('click', e => {
    if (!temQuickLook) { e.preventDefault(); return; }
    // libera a câmera para o AR do iPhone; ao voltar, um toque reativa a câmera do app
    const sis = cena.systems['mindar-image-system'];
    if (sis && sis.video && !$('hud').hidden) {
      try { sis.stop(); } catch (err) { /* já parada */ }
      $('btnReativar').hidden = false;
    }
  }));
  const abrirQL = e => { if (e) e.preventDefault(); $('ql').hidden = false; };
  $('btnQL').addEventListener('click', abrirQL);
  $('linkQL').addEventListener('click', abrirQL);
  $('btnQLFechar').addEventListener('click', () => { $('ql').hidden = true; });
  $('btnReativar').addEventListener('click', () => {
    $('btnReativar').hidden = true; $('ql').hidden = true;
    estado.vendo = false; atualizar();
    const sis = cena.systems['mindar-image-system'];
    if (sis) sis.start();
  });

  // ---------- interface ----------
  function atualizar() {
    const c = estado.atual && porId[estado.atual];
    const st = $('status');
    if (estado.vendo && c) {
      st.className = 'achou';
      $('statusTxt').textContent = decorando ? `Decorando a parede: ${c.nome.toUpperCase()}` : `Placa reconhecida: ${c.nome.toUpperCase()}`;
    } else {
      st.className = 'procurando';
      $('statusTxt').textContent = decorando ? 'Aponte para a placa para ver a decoração'
        : c ? 'Placa fora da câmera · mostrando a última posição' : 'Procurando uma placa… aponte para a imagem na parede';
    }
    $('mapa').hidden = !c || decorando;
    $('painel').hidden = !c || decorando;
    if (!c) return;
    $('pNome').textContent = c.nome;
    $('pRotulo').textContent = c.artigo === 'o' ? 'VOCÊ ESTÁ NO' : 'VOCÊ ESTÁ NA';
    $('pNome').style.color = c.cor;
    $('pInfo').textContent = c.info;
    $('pPerdido').hidden = estado.vendo;
    $('mapaComodo').textContent = c.nome.toUpperCase();
    $('painel').classList.toggle('emergencia', estado.emergencia);

    const box = $('destinos');
    box.innerHTML = '';
    for (const k of C.comodos) {
      if (k.id === c.id) continue;
      const b = document.createElement('button');
      b.className = 'chip' + (k.id === estado.destino && !estado.emergencia ? ' ativo' : '');
      b.style.setProperty('--cor', k.cor);
      b.textContent = k.nome;
      b.onclick = () => escolher(k.id, false);
      box.appendChild(b);
    }
    if (SAIDA) {
      const b = document.createElement('button');
      b.className = 'chip chip-saida' + (estado.emergencia ? ' ativo' : '');
      b.textContent = '🚨 Saída';
      b.onclick = () => {
        if (SAIDA.id === c.id) { aviso(`🚪 Você já está ${na(c)}, onde fica a saída.<small>${SAIDA.saida}</small>`, '#dc2626'); falar(`Você já está ${na(c)}. ${SAIDA.saida}`, true); return; }
        escolher(SAIDA.id, true);
      };
      box.appendChild(b);
    }
    const i = textoInstrucao();
    $('pInstrucao').innerHTML = i ? i.html : '';
    desenharMapa();
  }

  // Mini-mapa 2D (planta vista de cima, norte para cima)
  function desenharMapa() {
    const svg = $('mapaSvg');
    let maxX = 0, maxY = 0;
    for (const k of C.comodos) { maxX = Math.max(maxX, k.x + k.w); maxY = Math.max(maxY, k.y + k.h); }
    const m = 0.4;
    svg.setAttribute('viewBox', `${-m} ${-m} ${maxX + 2 * m} ${maxY + 2 * m}`);
    const corRota = estado.emergencia ? '#dc2626' : '#16a34a';
    let h = '';
    for (const k of C.comodos) {
      const atual = k.id === estado.atual, dest = k.id === estado.destino;
      h += `<rect x="${k.x}" y="${k.y}" width="${k.w}" height="${k.h}" fill="${k.cor}" fill-opacity="${atual ? 0.85 : dest ? 0.45 : 0.18}" stroke="#0f172a" stroke-width="0.12"/>`;
      const cc = centro(k);
      h += `<text x="${cc.x}" y="${cc.y + (atual ? 1.0 : 0.25)}" font-size="0.75" text-anchor="middle" font-weight="700" fill="${atual ? '#fff' : '#0f172a'}">${k.nome}</text>`;
    }
    for (const p of C.portas) h += `<circle cx="${p.x}" cy="${p.y}" r="0.35" fill="#f8fafc" stroke="#0f172a" stroke-width="0.06"/>`;
    if (SAIDA && SAIDA.porta) h += `<text x="${SAIDA.porta.x}" y="${SAIDA.porta.y + 0.3}" font-size="0.8" text-anchor="middle">🚪</text>`;
    const r = estado.destino && rota(estado.atual, estado.destino, estado.emergencia && SAIDA.porta);
    if (r) {
      const pts = r.pontos.map(p => `${p.x},${p.y}`).join(' ');
      h += `<polyline points="${pts}" fill="none" stroke="${corRota}" stroke-width="0.28" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="0.5 0.35"><animate attributeName="stroke-dashoffset" from="1.7" to="0" dur="0.8s" repeatCount="indefinite"/></polyline>`;
      const f = r.pontos[r.pontos.length - 1];
      h += `<text x="${f.x}" y="${f.y - 0.5}" font-size="0.9" text-anchor="middle">${estado.emergencia ? '🚪' : '🏁'}</text>`;
    }
    const pl = placa(porId[estado.atual]);
    h += `<rect x="${pl.p.x - 0.5}" y="${pl.p.y - 0.18}" width="1" height="0.36" fill="#facc15" stroke="#0f172a" stroke-width="0.05" transform="rotate(${pl.n.x !== 0 ? 90 : 0} ${pl.p.x} ${pl.p.y})"/>`;
    const eu = { x: pl.p.x + pl.n.x * 0.9, y: pl.p.y + pl.n.y * 0.9 };
    h += `<circle cx="${eu.x}" cy="${eu.y}" r="0.4" fill="#ef4444" fill-opacity="0.35"><animate attributeName="r" values="0.35;0.9;0.35" dur="1.4s" repeatCount="indefinite"/></circle>`;
    h += `<circle cx="${eu.x}" cy="${eu.y}" r="0.32" fill="#ef4444" stroke="#fff" stroke-width="0.1"/>`;
    h += `<text x="${maxX - 0.2}" y="${-m + 0.75}" text-anchor="end" font-size="0.55" font-weight="800" fill="#0f172a" fill-opacity="0.7">N↑</text>`;
    svg.innerHTML = h;
    if (window.Minimapa3D) window.Minimapa3D.atualizar({ atual: estado.atual, emergencia: estado.emergencia, pontos: r ? r.pontos : null });
  }

  // ---------- app instalável (funciona offline depois da 1ª visita) ----------
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* opcional */ });
  }
})();
