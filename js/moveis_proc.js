/*
 * MÓVEIS FEITOS EM CÓDIGO (paramétricos), para o que não existe escaneado em licença livre:
 * camas, guarda-roupa, cozinha, banheiro, tapetes, cortinas, sofá moderno, rack com TV…
 * Medidas reais (metros, padrão de mercado). Convenção: base em y = 0, frente para +z.
 * Cada função recebe a variante (cor/estampa) e devolve um THREE.Group. Usado por moveis.js.
 */
window.criarMoveisProc = function (THREE) {
  const std = (cor, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: cor, roughness: 0.6 }, extra || {}));
  const cache = {};
  function tex(nome, w, h, pintar, rep = [1, 1]) {
    if (cache[nome]) return cache[nome];
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; pintar(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); t.anisotropy = 4;
    return (cache[nome] = t);
  }
  const R = (a, b) => a + Math.random() * (b - a);
  // tecido: trama fina com ruído (multiplica a cor do material)
  const texTecido = () => tex('tecido', 256, 256, (c, w) => {
    c.fillStyle = '#e6e6e6'; c.fillRect(0, 0, w, w);
    for (let y = 0; y < w; y += 2) { c.fillStyle = `rgba(0,0,0,${R(0.03, 0.08)})`; c.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 2) { c.fillStyle = `rgba(255,255,255,${R(0.03, 0.08)})`; c.fillRect(x, 0, 1, w); }
    for (let k = 0; k < 3000; k++) { c.fillStyle = `rgba(0,0,0,${R(0.02, 0.07)})`; c.fillRect(R(0, w), R(0, w), 1.5, 1.5); }
  }, [4, 4]);
  const texMadeira = () => tex('madeira', 256, 512, (c, w, h) => {
    c.fillStyle = '#d8d8d8'; c.fillRect(0, 0, w, h);
    for (let k = 0; k < 70; k++) {
      c.strokeStyle = `rgba(60,40,20,${R(0.05, 0.16)})`; c.lineWidth = R(0.5, 2.5); const x = R(0, w);
      c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + R(-10, 10), h / 3, x + R(-10, 10), 2 * h / 3, x + R(-6, 6), h); c.stroke();
    }
  });
  const tecido = cor => std(cor, { map: texTecido(), roughness: 0.95 });
  const madeira = cor => std(cor, { map: texMadeira(), roughness: 0.5 });
  const metal = (cor = '#c4c7cb', r = 0.28) => std(cor, { metalness: 0.9, roughness: r });
  const ceramica = () => std('#fbfbf8', { roughness: 0.1 });
  // espelho: reflexo "pintado" (céu claro e um brilho diagonal), fica bonito em qualquer luz
  const texEspelho = () => tex('espelho', 128, 256, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#eef3f6'); gr.addColorStop(0.45, '#c9d5dc'); gr.addColorStop(0.5, '#f4f8fa'); gr.addColorStop(0.56, '#c3cfd6'); gr.addColorStop(1, '#9fb0ba');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
  });
  const matEspelho = () => std('#ffffff', { map: texEspelho(), metalness: 0.35, roughness: 0.06 });
  const vidro = () => new THREE.MeshStandardMaterial({ color: '#e0f2fe', transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false });

  // caixa com cantos arredondados (estofados, colchões, almofadas)
  function geoRedonda(w, h, d, r, s = 4) {
    const g = new THREE.BoxGeometry(w, h, d, s * 2, s * 2, s * 2), p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
    r = Math.min(r, w / 2, h / 2, d / 2) * 0.999; const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); c.set(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
      const n = v.clone().sub(c); if (n.lengthSq() > 1e-12) v.copy(c).add(n.normalize().multiplyScalar(r)); p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  }
  function peca(g, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = o.receiveShadow = true; g.add(o); return o;
  }
  const caixa = (g, w, h, d, x, y, z, m) => peca(g, new THREE.BoxGeometry(w, h, d), m, x, y, z);
  const redonda = (g, w, h, d, r, x, y, z, m, rx = 0) => peca(g, geoRedonda(w, h, d, r), m, x, y, z, rx);
  const cil = (g, r1, r2, h, x, y, z, m, seg = 24) => peca(g, new THREE.CylinderGeometry(r1, r2, h, seg), m, x, y, z);
  const puxador = (g, x, y, z, comp, vertical, m = metal()) => { const o = cil(g, 0.007, 0.007, comp, x, y, z, m, 10); if (!vertical) o.rotation.z = Math.PI / 2; return o; };

  const CORES_TECIDO = ['#8b9097', '#2f4a6b', '#c2ae93', '#5b6b4f', '#8a4a36', '#3d3d42'];
  const NOMES_TECIDO = ['cinza', 'azul', 'bege', 'verde', 'terracota', 'grafite'];
  const CORES_MOVEL = ['#f1eee8', '#a97c50', '#3b3f45', '#7f9488'];
  const NOMES_MOVEL = ['branco', 'carvalho', 'grafite', 'verde-sálvia'];

  function sofa(v) {
    const g = new THREE.Group(), cor = CORES_TECIDO[v % 6], m = tecido(cor), W = 2.1, D = 0.92;
    redonda(g, W, 0.2, D, 0.04, 0, 0.22, 0, m);
    const n = 3, lw = (W - 0.34) / n;
    for (let i = 0; i < n; i++) {
      redonda(g, lw - 0.01, 0.17, D - 0.26, 0.06, -W / 2 + 0.17 + lw * (i + 0.5), 0.405, 0.1, m);
      redonda(g, lw - 0.01, 0.46, 0.2, 0.08, -W / 2 + 0.17 + lw * (i + 0.5), 0.66, -D / 2 + 0.17, m, -0.14);
    }
    for (const s of [-1, 1]) redonda(g, 0.17, 0.5, D, 0.06, s * (W / 2 - 0.085), 0.37, 0, m);
    redonda(g, W - 0.02, 0.5, 0.12, 0.04, 0, 0.55, -D / 2 + 0.06, m);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cil(g, 0.022, 0.016, 0.12, x * (W / 2 - 0.1), 0.06, z * (D / 2 - 0.1), madeira('#3a2a1c'));
    const alm = tecido(CORES_TECIDO[(v + 2) % 6]);
    redonda(g, 0.42, 0.42, 0.13, 0.06, -W / 2 + 0.42, 0.66, -D / 2 + 0.33, alm, -0.3).rotation.z = 0.12;
    redonda(g, 0.42, 0.42, 0.13, 0.06, W / 2 - 0.42, 0.66, -D / 2 + 0.33, alm, -0.3).rotation.z = -0.12;
    return g;
  }
  function cama(v, casal) {
    const g = new THREE.Group(), W = casal ? 1.58 : 0.88, L = casal ? 2.0 : 1.9;
    const CORES = ['#ece7de', '#5c6f86', '#c9a99a', '#4a5a47', '#d8c9a8'];
    const base = tecido('#9a948b');
    redonda(g, W, 0.3, L, 0.02, 0, 0.27, 0, base);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cil(g, 0.02, 0.02, 0.12, x * (W / 2 - 0.08), 0.06, z * (L / 2 - 0.08), madeira('#3a2a1c'));
    redonda(g, W - 0.03, 0.22, L - 0.03, 0.06, 0, 0.53, 0, std('#f7f6f2', { roughness: 0.9 }));
    const ed = tecido(CORES[v % CORES.length]);
    redonda(g, W + 0.08, 0.07, L * 0.66, 0.035, 0, 0.645, L / 2 - L * 0.33 + 0.02, ed);
    redonda(g, W + 0.06, 0.05, 0.32, 0.025, 0, 0.685, L / 2 - L * 0.66 + 0.18, ed);
    const tr = tecido('#ffffff');
    for (const x of casal ? [-W / 4, W / 4] : [0]) redonda(g, casal ? 0.66 : 0.6, 0.15, 0.42, 0.07, x, 0.715, -L / 2 + 0.3, tr, -0.35);
    if (casal) redonda(g, 0.45, 0.4, 0.12, 0.06, 0, 0.78, -L / 2 + 0.55, tecido(CORES[(v + 2) % CORES.length]), -0.5);
    redonda(g, W + 0.14, 1.2, 0.1, 0.04, 0, 0.6, -L / 2 - 0.04, tecido(v % 2 ? '#3d3d42' : '#b9ab98'));
    return g;
  }
  function guardaRoupa(v) {
    const g = new THREE.Group(), W = 1.8, H = 2.1, D = 0.6, m = madeira(CORES_MOVEL[v % 4]), linha = std('#1f1f1f', { roughness: 0.8 });
    caixa(g, W, H - 0.06, D, 0, H / 2 + 0.03, 0, m); caixa(g, W - 0.04, 0.06, D - 0.04, 0, 0.03, 0, std('#222'));
    for (let i = 1; i < 3; i++) caixa(g, 0.006, H - 0.1, 0.004, -W / 2 + W / 3 * i, H / 2 + 0.03, D / 2 + 0.002, linha);
    caixa(g, W, 0.006, 0.004, 0, 0.5, D / 2 + 0.002, linha);
    for (const x of [-W / 3 + 0.05, -0.05, 0.05, W / 3 - 0.05]) puxador(g, x, 1.15, D / 2 + 0.025, 0.32, true, metal('#2b2b2b', 0.4));
    for (const x of [-W / 3, 0, W / 3]) puxador(g, x, 0.38, D / 2 + 0.025, 0.2, false, metal('#2b2b2b', 0.4));
    return g;
  }
  let texTela = null;
  function rackTv(v) {
    const g = new THREE.Group(), W = 1.8, m = madeira(['#8a6a4a', '#f1eee8', '#3b3f45'][v % 3]);
    caixa(g, W, 0.36, 0.42, 0, 0.29, 0, m);
    for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) for (const z of [-0.15, 0.15]) cil(g, 0.015, 0.015, 0.11, x, 0.055, z, metal('#222', 0.5));
    for (let i = 0; i < 3; i++) { caixa(g, W / 3 - 0.02, 0.3, 0.004, -W / 3 + W / 3 * i, 0.29, 0.212, madeira(['#6f5238', '#e4e0d8', '#2e3237'][v % 3])); }
    const tela = std('#050505', { roughness: 0.08, metalness: 0.6 });
    caixa(g, 1.24, 0.72, 0.045, 0, 0.47 + 0.08 + 0.36, -0.02, std('#111', { roughness: 0.4 }));
    if (v >= 3) {
      if (!texTela) { texTela = new THREE.TextureLoader().load((window.MOVEIS_BASE || '') + 'modelos/arte/grande_onda.jpg'); texTela.colorSpace = THREE.SRGBColorSpace; }
      peca(g, new THREE.PlaneGeometry(1.2, 0.68), new THREE.MeshBasicMaterial({ map: texTela, toneMapped: false }), 0, 0.91, 0.0035);
    } else peca(g, new THREE.PlaneGeometry(1.2, 0.68), tela, 0, 0.91, 0.0035);
    caixa(g, 0.3, 0.02, 0.2, 0, 0.48, -0.02, std('#111')); caixa(g, 0.05, 0.08, 0.03, 0, 0.52, -0.02, std('#111'));
    return g;
  }
  function geladeira(v) {
    const g = new THREE.Group(), W = 0.7, H = 1.85, D = 0.72;
    const m = [std('#d7dadd', { metalness: 0.55, roughness: 0.32 }), std('#f5f5f3', { roughness: 0.25 }), std('#1c1d20', { roughness: 0.25, metalness: 0.4 })][v % 3];
    redonda(g, W, H, D, 0.025, 0, H / 2 + 0.01, 0, m);
    caixa(g, W - 0.01, 0.008, 0.004, 0, 1.28, D / 2 + 0.002, std('#333'));
    puxador(g, W / 2 - 0.08, 1.55, D / 2 + 0.03, 0.4, true, metal('#9a9da1', 0.2)); puxador(g, W / 2 - 0.08, 0.95, D / 2 + 0.03, 0.55, true, metal('#9a9da1', 0.2));
    caixa(g, 0.12, 0.06, 0.004, -0.15, 1.45, D / 2 + 0.003, std('#0b1220', { emissive: '#38bdf8', emissiveIntensity: 0.4 }));
    return g;
  }
  function balcao(v) {
    const g = new THREE.Group(), W = 2.0, D = 0.6, m = madeira(CORES_MOVEL[v % 4]);
    const tampo = v % 2 ? std('#ece9e4', { roughness: 0.2 }) : std('#1d1d1f', { roughness: 0.22, metalness: 0.1 });
    caixa(g, W, 0.76, D - 0.05, 0, 0.48, -0.025, m); caixa(g, W - 0.02, 0.1, D - 0.1, 0, 0.05, -0.05, std('#1f1f1f'));
    for (let i = 1; i < 4; i++) caixa(g, 0.005, 0.74, 0.004, -W / 2 + W / 4 * i, 0.48, D / 2 - 0.048, std('#222'));
    for (let i = 0; i < 4; i++) puxador(g, -W / 2 + W / 4 * (i + 0.5), 0.8, D / 2 - 0.03, 0.18, false, metal('#2b2b2b', 0.4));
    caixa(g, W + 0.02, 0.03, D + 0.02, 0, 0.875, 0, tampo);
    caixa(g, 0.52, 0.006, 0.38, -0.45, 0.888, 0.02, metal('#a8abaf', 0.25)); caixa(g, 0.46, 0.004, 0.32, -0.45, 0.889, 0.02, std('#3a3c40', { metalness: 0.7, roughness: 0.3 }));
    cil(g, 0.014, 0.018, 0.28, -0.45, 1.03, -0.22, metal(), 16);
    const bico = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 10, 24, Math.PI), metal()); bico.position.set(-0.45, 1.17, -0.13); bico.rotation.y = Math.PI / 2; g.add(bico);
    caixa(g, 0.6, 0.008, 0.5, 0.48, 0.894, 0.02, std('#0a0a0a', { roughness: 0.05, metalness: 0.3 }));
    for (const [x, z, r] of [[0.34, -0.1, 0.09], [0.62, -0.1, 0.07], [0.34, 0.14, 0.07], [0.62, 0.14, 0.09]]) {
      const a = new THREE.Mesh(new THREE.TorusGeometry(r, 0.004, 6, 32), std('#555')); a.rotation.x = Math.PI / 2; a.position.set(x, 0.899, z); g.add(a);
    }
    return g;
  }
  function aereo(v) {
    const g = new THREE.Group(), W = 1.2, H = 0.7, D = 0.35, m = madeira(CORES_MOVEL[v % 4]);
    caixa(g, W, H, D, 0, 0, D / 2, m); caixa(g, 0.005, H - 0.02, 0.004, 0, 0, D + 0.002, std('#222'));
    for (const x of [-0.05, 0.05]) puxador(g, x, -H / 2 + 0.08, D + 0.02, 0.14, false, metal('#2b2b2b', 0.4));
    return g;
  }
  function vaso() {
    const g = new THREE.Group(), c = ceramica();
    const pe = cil(g, 0.12, 0.15, 0.3, 0, 0.15, 0.04, c, 32); pe.scale.z = 1.35;
    const bacia = peca(g, new THREE.SphereGeometry(0.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), c, 0, 0.31, 0.06, Math.PI); bacia.scale.set(0.95, 0.5, 1.3);
    const ass = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.028, 12, 40), std('#ffffff', { roughness: 0.3 })); ass.rotation.x = Math.PI / 2; ass.scale.set(1, 1.3, 1); ass.position.set(0, 0.42, 0.06); ass.castShadow = true; g.add(ass);
    const tampa = peca(g, new THREE.CylinderGeometry(0.19, 0.19, 0.02, 32), std('#ffffff', { roughness: 0.3 }), 0, 0.62, -0.14, -1.45); tampa.scale.z = 1.25;
    redonda(g, 0.42, 0.38, 0.18, 0.03, 0, 0.62, -0.22, c);
    cil(g, 0.03, 0.03, 0.01, 0, 0.815, -0.22, metal(), 20);
    return g;
  }
  function pia(v) {
    const g = new THREE.Group(), m = madeira(CORES_MOVEL[v % 4]);
    caixa(g, 0.8, 0.62, 0.46, 0, 0.47, 0, m); caixa(g, 0.005, 0.6, 0.004, 0, 0.47, 0.232, std('#222'));
    for (const x of [-0.05, 0.05]) puxador(g, x, 0.68, 0.25, 0.12, true, metal('#2b2b2b', 0.4));
    cil(g, 0.02, 0.02, 0.16, -0.3, 0.08, -0.15, metal(), 10); cil(g, 0.02, 0.02, 0.16, 0.3, 0.08, -0.15, metal(), 10);
    caixa(g, 0.82, 0.03, 0.48, 0, 0.795, 0, std('#ece9e4', { roughness: 0.2 }));
    const cuba = peca(g, new THREE.SphereGeometry(0.2, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), ceramica(), 0, 0.89, 0.03, Math.PI); cuba.scale.set(1, 0.45, 0.8);
    const borda = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.008, 8, 40), ceramica()); borda.rotation.x = Math.PI / 2; borda.scale.y = 0.8; borda.position.set(0, 0.89, 0.03); g.add(borda);
    cil(g, 0.014, 0.018, 0.22, 0, 0.92, -0.19, metal(), 16);
    const bico = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 10, 20, Math.PI), metal()); bico.position.set(0, 1.03, -0.13); bico.rotation.y = Math.PI / 2; g.add(bico);
    return g;
  }
  function espelho(v) {
    const g = new THREE.Group(), W = v % 2 ? 0.6 : 0.7, H = v % 2 ? 0.6 : 0.9;
    if (v % 2) { peca(g, new THREE.CylinderGeometry(0.32, 0.32, 0.025, 48), metal('#1f1f1f', 0.5), 0, 0, 0.0125, Math.PI / 2); peca(g, new THREE.CircleGeometry(0.3, 48), matEspelho(), 0, 0, 0.026); }
    else { redonda(g, W + 0.04, H + 0.04, 0.025, 0.012, 0, 0, 0.0125, metal('#1f1f1f', 0.5)); peca(g, new THREE.PlaneGeometry(W, H), matEspelho(), 0, 0, 0.026); }
    return g;
  }
  function boxChuveiro() {
    const g = new THREE.Group(), L = 0.9, H = 1.95, vd = vidro(), perfil = metal('#d4d4d8', 0.2);
    caixa(g, L, 0.05, L, 0, 0.025, 0, ceramica());
    peca(g, new THREE.PlaneGeometry(L - 0.02, H), vd, 0, 0.05 + H / 2, L / 2 - 0.01);
    peca(g, new THREE.PlaneGeometry(L - 0.02, H), vd, L / 2 - 0.01, 0.05 + H / 2, 0, 0, Math.PI / 2);
    for (const [x, z] of [[L / 2 - 0.01, L / 2 - 0.01], [-L / 2 + 0.01, L / 2 - 0.01], [L / 2 - 0.01, -L / 2 + 0.01]]) cil(g, 0.01, 0.01, H, x, 0.05 + H / 2, z, perfil, 8);
    caixa(g, L, 0.02, 0.02, 0, 0.05 + H, L / 2 - 0.01, perfil); caixa(g, 0.02, 0.02, L, L / 2 - 0.01, 0.05 + H, 0, perfil);
    cil(g, 0.012, 0.012, 0.35, -0.2, 2.0, -L / 2 + 0.2, metal(), 10).rotation.x = Math.PI / 2;
    cil(g, 0.11, 0.11, 0.02, -0.2, 1.98, -L / 2 + 0.36, metal('#c4c7cb', 0.15), 32);
    cil(g, 0.04, 0.04, 0.05, -0.2, 1.15, -L / 2 + 0.02, metal(), 16).rotation.x = Math.PI / 2;
    return g;
  }
  function banheira() {
    const g = new THREE.Group(), W = 1.7, D = 0.75, H = 0.55, c = ceramica(), e = 0.07;
    redonda(g, W, 0.08, D, 0.03, 0, 0.04, 0, c);
    redonda(g, W, H, e, 0.03, 0, H / 2, D / 2 - e / 2, c); redonda(g, W, H, e, 0.03, 0, H / 2, -D / 2 + e / 2, c);
    redonda(g, e, H, D, 0.03, W / 2 - e / 2, H / 2, 0, c); redonda(g, e, H, D, 0.03, -W / 2 + e / 2, H / 2, 0, c);
    caixa(g, W - 2 * e, 0.01, D - 2 * e, 0, 0.3, 0, std('#bfe3f2', { transparent: true, opacity: 0.55, roughness: 0.02 }));
    cil(g, 0.015, 0.015, 0.2, -W / 2 + 0.12, H + 0.1, 0, metal(), 12);
    const bico = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 10, 20, Math.PI), metal()); bico.position.set(-W / 2 + 0.18, H + 0.2, 0); g.add(bico);
    return g;
  }
  const TAPETES = ['persa', 'geométrico', 'listrado', 'felpudo', 'redondo'];
  function tapete(v) {
    const g = new THREE.Group(), tipo = TAPETES[v % TAPETES.length];
    const t = tex('tapete_' + tipo, 512, tipo === 'redondo' ? 512 : 360, (c, w, h) => {
      if (tipo === 'persa') {
        c.fillStyle = '#7a1f22'; c.fillRect(0, 0, w, h); c.strokeStyle = '#d9b77a'; c.lineWidth = 10; c.strokeRect(18, 18, w - 36, h - 36);
        c.fillStyle = '#1e2a4a'; c.fillRect(36, 36, w - 72, h - 72); c.fillStyle = '#7a1f22'; c.fillRect(52, 52, w - 104, h - 104);
        for (let k = 0; k < 7; k++) { c.strokeStyle = ['#d9b77a', '#e8dcc0', '#1e2a4a'][k % 3]; c.lineWidth = 6; c.beginPath(); c.ellipse(w / 2, h / 2, 130 - k * 17, 80 - k * 10, 0, 0, 7); c.stroke(); }
        for (let i = 0; i < 4; i++) { c.fillStyle = '#d9b77a'; c.beginPath(); c.arc(i % 2 ? w - 90 : 90, i < 2 ? 90 : h - 90, 22, 0, 7); c.fill(); }
      } else if (tipo === 'geométrico') {
        c.fillStyle = '#ede6d8'; c.fillRect(0, 0, w, h);
        for (let x = 0; x < w; x += 64) for (let y = 0; y < h; y += 60) { c.strokeStyle = '#2b2b2b'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y + 60); c.lineTo(x + 32, y); c.lineTo(x + 64, y + 60); c.stroke(); if ((x + y) % 3 === 0) { c.fillStyle = '#c59b4d'; c.beginPath(); c.moveTo(x + 16, y + 60); c.lineTo(x + 32, y + 28); c.lineTo(x + 48, y + 60); c.fill(); } }
      } else if (tipo === 'listrado') {
        const cs = ['#1f3b57', '#e9e3d6', '#5b7fa3', '#e9e3d6', '#c2a36b'];
        for (let y = 0, i = 0; y < h; i++) { const e = [40, 14, 26, 14, 8][i % 5]; c.fillStyle = cs[i % 5]; c.fillRect(0, y, w, e); y += e; }
      } else if (tipo === 'redondo') {
        for (let k = 0; k < 9; k++) { c.fillStyle = k % 2 ? '#e8e1d3' : ['#8a9a7b', '#c79a6b', '#6e7f91'][k % 3]; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - k * 28, 0, 7); c.fill(); }
      } else { c.fillStyle = '#efe9df'; c.fillRect(0, 0, w, h); }
      for (let k = 0; k < 9000; k++) { c.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},${R(0.02, 0.08)})`; c.fillRect(R(0, w), R(0, h), 2, 2); }
    });
    const m = std('#ffffff', { map: t, roughness: 1 });
    if (tipo === 'redondo') { const o = peca(g, new THREE.CylinderGeometry(0.8, 0.8, 0.012, 64), m, 0, 0.006, 0); o.castShadow = false; }
    else { const o = peca(g, new THREE.BoxGeometry(tipo === 'felpudo' ? 1.6 : 2.0, 0.012, tipo === 'felpudo' ? 1.1 : 1.4), m, 0, 0.006, 0); o.castShadow = false; }
    return g;
  }
  function cortina(v) {
    const g = new THREE.Group(), W = 1.9, H = 2.35, cor = ['#ece6da', '#8a9aa8', '#6b4f3a', '#2f3b4c', '#c9b8a0'][v % 5];
    const geo = new THREE.PlaneGeometry(W, H, 90, 1), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, 0.07 + 0.04 * Math.sin(x / W * Math.PI * 22)); }
    geo.computeVertexNormals();
    const m = std(cor, { map: texTecido(), roughness: 1, side: THREE.DoubleSide, transparent: v === 0, opacity: v === 0 ? 0.85 : 1 });
    const o = peca(g, geo, m, 0, 0, 0); o.castShadow = false;
    cil(g, 0.012, 0.012, W + 0.3, 0, H / 2 + 0.04, 0.07, metal('#2b2b2b', 0.4), 10).rotation.z = Math.PI / 2;
    return g;
  }
  function luminariaPiso(v) {
    const g = new THREE.Group(), m = metal(['#1f1f1f', '#b08d3c'][v % 2], 0.35);
    cil(g, 0.16, 0.17, 0.03, 0, 0.015, 0, m, 40); cil(g, 0.012, 0.012, 1.45, 0, 0.75, 0, m, 12);
    const cup = peca(g, new THREE.CylinderGeometry(0.16, 0.24, 0.3, 40, 1, true), std('#f1ebe0', { roughness: 0.95, side: THREE.DoubleSide, emissive: '#ffe8c2', emissiveIntensity: 0.35 }), 0, 1.5, 0);
    cup.castShadow = false;
    return g;
  }
  function cadeiraEscritorio(v) {
    const g = new THREE.Group(), m = tecido(['#2b2b2e', '#2f4a6b', '#8b9097'][v % 3]), mt = metal('#2a2a2a', 0.35);
    redonda(g, 0.5, 0.08, 0.48, 0.03, 0, 0.48, 0.02, m);
    redonda(g, 0.46, 0.58, 0.06, 0.03, 0, 0.85, -0.23, m, -0.12);
    cil(g, 0.025, 0.025, 0.3, 0, 0.3, 0, mt, 16);
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * Math.PI * 2, b = caixa(g, 0.3, 0.03, 0.04, Math.cos(a) * 0.15, 0.09, Math.sin(a) * 0.15, mt); b.rotation.y = -a;
      peca(g, new THREE.SphereGeometry(0.028, 12, 8), std('#111'), Math.cos(a) * 0.29, 0.03, Math.sin(a) * 0.29);
    }
    for (const s of [-1, 1]) { caixa(g, 0.04, 0.2, 0.04, s * 0.26, 0.6, 0, mt); caixa(g, 0.06, 0.03, 0.26, s * 0.26, 0.71, 0, std('#111')); }
    return g;
  }
  function mesaJantar(v) {
    const g = new THREE.Group(), W = 1.6, D = 0.9, m = madeira(['#8a6a4a', '#f1eee8', '#3b3f45'][v % 3]);
    caixa(g, W, 0.04, D, 0, 0.75, 0, m);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) caixa(g, 0.05, 0.73, 0.05, x * (W / 2 - 0.08), 0.365, z * (D / 2 - 0.08), v % 3 === 2 ? metal('#1f1f1f', 0.4) : m);
    return g;
  }
  const PROC = {
    sofa_moderno: { f: sofa, vs: NOMES_TECIDO }, cama_casal: { f: v => cama(v, true), vs: ['branca', 'azul', 'rosé', 'verde', 'areia'] }, cama_solteiro: { f: v => cama(v, false), vs: ['branca', 'azul', 'rosé', 'verde', 'areia'] },
    guarda_roupa: { f: guardaRoupa, vs: NOMES_MOVEL }, rack_tv: { f: rackTv, vs: ['madeira', 'branco', 'grafite', 'TV ligada'] }, geladeira: { f: geladeira, vs: ['inox', 'branca', 'preta'] },
    balcao_cozinha: { f: balcao, vs: NOMES_MOVEL }, armario_aereo: { f: aereo, vs: NOMES_MOVEL }, vaso_sanitario: { f: vaso, vs: [''] }, pia_banheiro: { f: pia, vs: NOMES_MOVEL },
    espelho_banheiro: { f: espelho, vs: ['retangular', 'redondo'] }, box_chuveiro: { f: boxChuveiro, vs: [''] }, banheira: { f: banheira, vs: [''] }, tapete: { f: tapete, vs: TAPETES },
    cortina: { f: cortina, vs: ['linho', 'cinza-azul', 'café', 'marinho', 'areia'] }, luminaria_piso: { f: luminariaPiso, vs: ['preta', 'dourada'] },
    cadeira_escritorio: { f: cadeiraEscritorio, vs: ['preta', 'azul', 'cinza'] }, mesa_jantar: { f: mesaJantar, vs: ['madeira', 'branca', 'preta'] },
  };
  return PROC;
};
