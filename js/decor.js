/*
 * MODO DECORAR: coloca objetos 3D (quadro, relógio, prateleira, vaso, marcador)
 * NA PAREDE REAL, presos à placa reconhecida pela câmera.
 *
 * Como funciona: a placa define o plano da parede. Um toque na tela vira um raio
 * que sai da câmera (Raycaster). O ponto onde o raio cruza o plano da parede é
 * onde o objeto é colocado. Os objetos ficam em tamanho real (metros), porque
 * sabemos a largura impressa da placa (config.js → larguraPlaca).
 * Objetos de chão (vaso) vão para o chão, abaixo do ponto tocado (config.js → alturaPlaca).
 * A decoração fica salva no celular (localStorage) e reaparece ao voltar à placa.
 */
(function () {
  const THREE = AFRAME.THREE;
  const { C, porId } = window.Casa;
  const LARG = C.larguraPlaca || 0.17;  // largura impressa da placa, em metros
  const ALT = C.alturaPlaca || 1.5;     // altura do centro da placa até o chão, em metros
  const CHAVE = 'onde-estou-decor-v1';
  const cena = document.getElementById('cena');
  const $ = id => document.getElementById(id);

  const TIPOS = Object.assign({}, window.Moveis.TIPOS, {
    marcador: { nome: 'Marcar', emoji: '📌', local: 'parede', variantes: 1 },
  });

  let ativo = false, comodo = null, armado = null, sel = null, arrasto = null, pinca = null, helper = null;
  const grupos = {}, dedos = new Map();
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plano = new THREE.Plane();

  let dados = {};
  try { dados = JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch (e) { dados = {}; }
  const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(dados)); } catch (e) { /* modo privado */ } };

  // ---------- cena ----------
  function grupo(id) {
    if (grupos[id]) return grupos[id];
    const el = document.querySelector(`[data-comodo="${id}"]`);
    const g = new THREE.Group();
    g.scale.setScalar(1 / LARG); // dentro do grupo, 1 unidade = 1 metro
    g.visible = false;
    g.add(new THREE.HemisphereLight('#ffffff', '#8a7f70', 1.8));
    const sol = new THREE.DirectionalLight('#ffffff', 1.5);
    sol.position.set(0.6, 1.2, 1.5); g.add(sol, sol.target);
    const itens = new THREE.Group(); g.add(itens);
    g.userData.itens = itens;
    el.setObject3D('decor', g);
    grupos[id] = g;
    for (const d of (dados[id] || [])) itens.add(construir(d));
    return g;
  }

  function marcador(texto) {
    const m = new THREE.Group();
    const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 14), new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 0.35 }));
    cabeca.position.z = 0.06;
    const agulha = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 8), new THREE.MeshStandardMaterial({ color: '#94a3b8' }));
    agulha.rotation.x = Math.PI / 2; agulha.position.z = 0.03;
    const et = window.Geo3D.etiqueta('📌 ' + texto, { cor: '#ffffff', fundo: '#ef4444', escala: 0.07 });
    et.position.set(0, 0.11, 0.06);
    m.add(cabeca, agulha, et);
    return m;
  }

  function construir(d) {
    const w = new THREE.Group();
    w.add(d.tipo === 'marcador' ? marcador(d.texto || 'Marcador') : window.Moveis.criar(d.tipo, d.v || 0));
    w.userData.d = d;
    posicionar(w);
    return w;
  }
  const noChao = d => TIPOS[d.tipo].local === 'chao';
  function posicionar(w) {
    const d = w.userData.d;
    if (noChao(d)) w.position.set(d.x, -ALT, d.z != null ? d.z : 0.35);
    else w.position.set(d.x, d.y, 0.004);
    w.scale.setScalar(d.esc || 1);
  }

  // ---------- toque → ponto na parede (ou no chão) ----------
  function raio(e) {
    const r = cena.canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cena.camera);
    ray.camera = cena.camera; // necessário para acertar as etiquetas (sprites)
  }
  function pontoNoPlano(chao) {
    const g = grupos[comodo];
    g.updateWorldMatrix(true, false);
    const n = new THREE.Vector3(0, chao ? 1 : 0, chao ? 0 : 1).transformDirection(g.matrixWorld);
    const p = new THREE.Vector3(0, chao ? -ALT : 0, 0).applyMatrix4(g.matrixWorld);
    plano.setFromNormalAndCoplanarPoint(n, p);
    const out = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plano, out)) return null;
    return g.worldToLocal(out); // em metros, no referencial da placa
  }
  const placaVisivel = () => {
    const el = comodo && document.querySelector(`[data-comodo="${comodo}"]`);
    return !!(el && el.object3D.visible);
  };

  function selecionar(w) {
    sel = w;
    if (!helper) { helper = new THREE.BoxHelper(undefined, '#38bdf8'); helper.material.depthTest = false; helper.renderOrder = 20; cena.object3D.add(helper); }
    if (w) helper.setFromObject(w);
    helper.visible = !!w;
    ui();
  }

  function adicionar(tipo, p) {
    let texto;
    if (tipo === 'marcador') {
      texto = window.prompt('O que você quer marcar aqui? (ex.: Tomada, Ponto de luz, Furar aqui)', 'Furar aqui');
      if (!texto) return;
      texto = texto.slice(0, 28);
    }
    const d = { tipo, x: +p.x.toFixed(3), y: +p.y.toFixed(3), esc: 1, v: 0 };
    if (texto) d.texto = texto;
    if (TIPOS[tipo].local === 'chao') { d.y = 0; d.z = 0.35; }
    (dados[comodo] = dados[comodo] || []).push(d);
    const w = construir(d);
    grupos[comodo].userData.itens.add(w);
    salvar();
    if (navigator.vibrate) navigator.vibrate(30);
    selecionar(w);
  }

  // Captura no window: roda antes de outros ouvintes (ex.: arrastar do simulador)
  window.addEventListener('pointerdown', e => {
    Decor.consumiu = false;
    if (!ativo || e.target !== cena.canvas) return;
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (dedos.size === 2 && sel) { // pinça: muda o tamanho
      const [a, b] = [...dedos.values()];
      pinca = { dist: Math.hypot(a.x - b.x, a.y - b.y), esc: sel.userData.d.esc || 1 };
      arrasto = null; Decor.consumiu = true; return;
    }
    if (!placaVisivel()) { dica('⚠️ Aponte a câmera para a placa: os objetos ficam presos à parede dela.'); return; }
    raio(e);
    if (armado) { // item escolhido no catálogo: o toque coloca, mesmo em cima de outro objeto
      const p = pontoNoPlano(false);
      const tipo = armado; armado = null;
      if (p) adicionar(tipo, p);
      Decor.consumiu = true;
      ui();
      return;
    }
    const g = grupos[comodo];
    const hits = ray.intersectObjects(g.userData.itens.children, true);
    if (hits.length) {
      let o = hits[0].object; while (o.parent && !o.userData.d) o = o.parent;
      selecionar(o);
      const p = pontoNoPlano(noChao(o.userData.d));
      if (p) arrasto = { w: o, dx: o.position.x - p.x, dy: o.position.y - p.y, dz: o.position.z - p.z };
      Decor.consumiu = true;
      return;
    }
    selecionar(null);
  }, true);

  window.addEventListener('pointermove', e => {
    if (!dedos.has(e.pointerId)) return;
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinca && sel && dedos.size >= 2) {
      const [a, b] = [...dedos.values()];
      sel.userData.d.esc = THREE.MathUtils.clamp(pinca.esc * Math.hypot(a.x - b.x, a.y - b.y) / pinca.dist, 0.3, 3);
      posicionar(sel); return;
    }
    if (!arrasto || !placaVisivel()) return;
    raio(e);
    const d = arrasto.w.userData.d, chao = noChao(d);
    const p = pontoNoPlano(chao);
    if (!p) return;
    d.x = +(p.x + arrasto.dx).toFixed(3);
    if (chao) d.z = +Math.max(0.15, p.z + arrasto.dz).toFixed(3);
    else d.y = +(p.y + arrasto.dy).toFixed(3);
    posicionar(arrasto.w);
  });
  const soltar = e => {
    dedos.delete(e.pointerId);
    if (arrasto || pinca) salvar();
    if (dedos.size < 2) pinca = null;
    if (!dedos.size) arrasto = null;
  };
  window.addEventListener('pointerup', soltar);
  window.addEventListener('pointercancel', soltar);

  // relógios com a hora certa + caixa de seleção
  (function loop() {
    requestAnimationFrame(loop);
    if (!ativo || !grupos[comodo]) return;
    const agora = new Date();
    grupos[comodo].userData.itens.children.forEach(w => { const f = w.children[0].userData.atualizar; if (f) f(agora); });
    if (sel && helper) { helper.setFromObject(sel); helper.visible = placaVisivel(); }
  })();

  // ---------- interface (barra "Decorar") ----------
  function dica(t) { $('decorDica').innerHTML = t; }
  function ui() {
    if (!ativo) return;
    const c = porId[comodo];
    $('decorTitulo').textContent = '🛋️ Decorar · ' + c.nome;
    const n = (dados[comodo] || []).length;
    $('decorConta').textContent = n ? `${n} ${n > 1 ? 'itens' : 'item'} nesta parede` : '';
    document.querySelectorAll('#catalogo .chip').forEach(b => b.classList.toggle('ativo', b.dataset.tipo === armado));
    $('decorEdicao').hidden = !sel;
    if (sel) {
      const t = TIPOS[sel.userData.d.tipo];
      $('btnVariar').hidden = t.variantes < 2;
      dica(`<b>${t.emoji} ${t.nome}</b> selecionado · arraste para mover${t.local === 'chao' ? ' pelo chão' : ''} · pinça ou − + para o tamanho`);
    } else if (armado) {
      const t = TIPOS[armado];
      dica(t.local === 'chao'
        ? `👆 Toque na parede <b>acima</b> do lugar: o ${t.nome.replace(' (chão)', '').toLowerCase()} vai para o chão logo abaixo`
        : `👆 Toque na parede onde quer ${armado === 'marcador' ? 'marcar' : 'colocar o ' + t.nome.toLowerCase()}`);
    } else {
      dica('Escolha um item e toque na parede para colocar. Toque num objeto para mover.<br><small>Os objetos têm <b>tamanho real</b>: afaste-se 1 a 2 m da parede para vê-los inteiros, sem perder a placa de vista.</small>');
    }
  }

  function montarCatalogo() {
    const box = $('catalogo');
    for (const [id, t] of Object.entries(TIPOS)) {
      const b = document.createElement('button');
      b.className = 'chip'; b.dataset.tipo = id; b.style.setProperty('--cor', '#0f172a');
      b.textContent = `${t.emoji} ${t.nome}`;
      b.onclick = () => { armado = armado === id ? null : id; selecionar(null); };
      box.appendChild(b);
    }
    $('btnMenor').onclick = () => { if (sel) { sel.userData.d.esc = Math.max(0.3, (sel.userData.d.esc || 1) / 1.15); posicionar(sel); salvar(); } };
    $('btnMaior').onclick = () => { if (sel) { sel.userData.d.esc = Math.min(3, (sel.userData.d.esc || 1) * 1.15); posicionar(sel); salvar(); } };
    $('btnVariar').onclick = () => {
      if (!sel) return;
      const d = sel.userData.d, t = TIPOS[d.tipo];
      d.v = ((d.v || 0) + 1) % t.variantes;
      const novo = construir(d), pai = sel.parent;
      pai.remove(sel); pai.add(novo); salvar(); selecionar(novo);
    };
    $('btnRemover').onclick = () => {
      if (!sel) return;
      dados[comodo] = (dados[comodo] || []).filter(d => d !== sel.userData.d);
      sel.parent.remove(sel); salvar(); selecionar(null);
    };
    $('btnLimpar').onclick = () => {
      if (!(dados[comodo] || []).length || !window.confirm('Remover toda a decoração desta parede?')) return;
      limpar();
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarCatalogo); else montarCatalogo();

  function limpar() {
    dados[comodo] = [];
    const it = grupos[comodo] && grupos[comodo].userData.itens;
    while (it && it.children.length) it.remove(it.children[0]);
    salvar(); selecionar(null);
  }

  function trocar(id) {
    if (comodo && grupos[comodo]) grupos[comodo].visible = false;
    comodo = id; selecionar(null);
    if (ativo) grupo(id).visible = true;
    ui();
  }

  window.Decor = {
    consumiu: false,
    get ativo() { return ativo; },
    entrar(id) { ativo = true; armado = null; trocar(id); },
    trocar,
    sair() { ativo = false; armado = null; selecionar(null); if (comodo && grupos[comodo]) grupos[comodo].visible = false; },
    armar(tipo) { armado = tipo; ui(); },        // usados pelo simulador/testes
    colocar(tipo, x, y) { armado = null; adicionar(tipo, { x, y }); ui(); },
    itens: () => (dados[comodo] || []).slice(),
    limpar,
  };
})();
