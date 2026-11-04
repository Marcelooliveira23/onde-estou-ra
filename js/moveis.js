/*
 * MÓVEIS E OBJETOS DE DECORAÇÃO (modelos 3D feitos em código, em METROS).
 * Usados no modo "Decorar" do app e também para gerar os arquivos .usdz do
 * AR nativo do iPhone (Quick Look).
 *
 * Convenções:
 *  - objetos de PAREDE: centro na origem, costas encostadas em z = 0, saindo para +z;
 *  - objetos de CHÃO: base em y = 0, centro em x = z = 0.
 */
(function (THREE) {
  const std = (cor, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: cor, roughness: 0.6 }, extra || {}));
  const NA_FRENTE = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 };

  // gerador pseudoaleatório com semente (as artes saem sempre iguais)
  function rnd(semente) { let s = semente; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  function texturaCanvas(w, h, pintar) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    pintar(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }

  // ---------- artes dos quadros (originais, desenhadas em código) ----------
  const ARTES = [
    function paisagem(c, w, h) {
      let g = c.createLinearGradient(0, 0, 0, h * 0.6); g.addColorStop(0, '#7dd3fc'); g.addColorStop(1, '#fde68a');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fb923c'; c.beginPath(); c.arc(w * 0.72, h * 0.32, h * 0.1, 0, 7); c.fill();
      const montanha = (cor, base, alt, n, sem) => {
        const r = rnd(sem); c.fillStyle = cor; c.beginPath(); c.moveTo(0, h);
        for (let i = 0; i <= n; i++) c.lineTo(i / n * w, base - r() * alt);
        c.lineTo(w, h); c.fill();
      };
      montanha('#64748b', h * 0.55, h * 0.3, 6, 7); montanha('#475569', h * 0.62, h * 0.18, 9, 11);
      montanha('#16a34a', h * 0.72, h * 0.08, 5, 3);
      g = c.createLinearGradient(0, h * 0.75, 0, h); g.addColorStop(0, '#38bdf8'); g.addColorStop(1, '#0369a1');
      c.fillStyle = g; c.fillRect(0, h * 0.78, w, h * 0.22);
      c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 3;
      for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(w * (0.1 + i * 0.15), h * (0.83 + (i % 3) * 0.05)); c.lineTo(w * (0.16 + i * 0.15), h * (0.83 + (i % 3) * 0.05)); c.stroke(); }
    },
    function abstrato(c, w, h) {
      c.fillStyle = '#f5efe0'; c.fillRect(0, 0, w, h);
      const r = rnd(42), cores = ['#ef4444', '#2563eb', '#facc15', '#0f172a', '#16a34a', '#f97316'];
      for (let i = 0; i < 7; i++) { c.fillStyle = cores[i % cores.length]; c.globalAlpha = 0.85; c.beginPath(); c.arc(r() * w, r() * h, 20 + r() * 80, 0, 7); c.fill(); }
      c.globalAlpha = 1; c.strokeStyle = '#0f172a'; c.lineWidth = 6;
      for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(r() * w, r() * h); c.lineTo(r() * w, r() * h); c.stroke(); }
      c.strokeStyle = '#ef4444'; c.lineWidth = 10; c.beginPath(); c.arc(w * 0.5, h * 0.5, h * 0.3, 3.4, 5.8); c.stroke();
    },
    function noite(c, w, h) {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b1026'); g.addColorStop(1, '#3b2a6b');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      const r = rnd(5); c.fillStyle = '#fff';
      for (let i = 0; i < 80; i++) { c.globalAlpha = 0.4 + r() * 0.6; c.fillRect(r() * w, r() * h * 0.6, 2, 2); }
      c.globalAlpha = 1; c.fillStyle = '#fef9c3'; c.beginPath(); c.arc(w * 0.25, h * 0.25, h * 0.09, 0, 7); c.fill();
      c.fillStyle = '#0b1026'; c.beginPath(); c.arc(w * 0.27, h * 0.23, h * 0.08, 0, 7); c.fill();
      let x = 0; const r2 = rnd(9);
      while (x < w) { const bw = 25 + r2() * 45, bh = h * (0.15 + r2() * 0.35); c.fillStyle = '#111827'; c.fillRect(x, h - bh, bw, bh);
        c.fillStyle = '#fde047'; for (let j = 0; j < 6; j++) if (r2() > 0.5) c.fillRect(x + 5 + (j % 2) * (bw / 2 - 2), h - bh + 8 + Math.floor(j / 2) * 16, 6, 8);
        x += bw + 3; }
    },
  ];

  function quadro(v) {
    const g = new THREE.Group();
    const moldura = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.47, 0.035), std(['#5b3a1e', '#111827', '#d4a017'][v % 3], { roughness: 0.45 }));
    moldura.position.z = 0.0175;
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.40), std('#ffffff', { map: texturaCanvas(512, 372, ARTES[v % 3]), roughness: 0.8, ...NA_FRENTE }));
    tela.position.z = 0.038;
    g.add(moldura, tela);
    return g;
  }

  function relogio(v) {
    const g = new THREE.Group();
    const escuro = v % 2 === 1;
    const aro = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.045, 48), std(escuro ? '#111827' : '#b45309', { roughness: 0.35 }));
    aro.rotation.x = Math.PI / 2; aro.position.z = 0.0225;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.15, 48), std('#ffffff', {
      map: texturaCanvas(256, 256, (c, w) => {
        c.fillStyle = escuro ? '#1f2937' : '#fffdf5'; c.fillRect(0, 0, w, w);
        c.strokeStyle = c.fillStyle = escuro ? '#f8fafc' : '#111827';
        for (let i = 0; i < 60; i++) {
          const a = i / 60 * Math.PI * 2, l = i % 5 ? 8 : 18;
          c.lineWidth = i % 5 ? 2 : 5; c.beginPath();
          c.moveTo(128 + Math.sin(a) * 120, 128 - Math.cos(a) * 120); c.lineTo(128 + Math.sin(a) * (120 - l), 128 - Math.cos(a) * (120 - l)); c.stroke();
        }
        c.font = 'bold 34px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        [[12, 0], [3, 1], [6, 2], [9, 3]].forEach(([n, i]) => { const a = i * Math.PI / 2; c.fillText(n, 128 + Math.sin(a) * 82, 128 - Math.cos(a) * 82); });
      }), roughness: 0.5, ...NA_FRENTE }));
    face.position.z = 0.048;
    g.add(aro, face);
    const corP = escuro ? '#f8fafc' : '#111827';
    const ponteiro = (comp, larg, cor, z) => {
      const piv = new THREE.Group(); piv.position.z = z;
      const m = new THREE.Mesh(new THREE.BoxGeometry(larg, comp, 0.004), std(cor)); m.position.y = comp / 2 - 0.015;
      piv.add(m); g.add(piv); return piv;
    };
    const ph = ponteiro(0.08, 0.012, corP, 0.053), pm = ponteiro(0.12, 0.008, corP, 0.058), ps = ponteiro(0.13, 0.003, '#dc2626', 0.063);
    const miolo = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.02, 16), std('#dc2626')); miolo.rotation.x = Math.PI / 2; miolo.position.z = 0.062;
    g.add(miolo);
    // mostra a hora certa (o app chama a cada quadro)
    g.userData.atualizar = (d) => {
      const s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
      ps.rotation.z = -s / 60 * Math.PI * 2; pm.rotation.z = -m / 60 * Math.PI * 2; ph.rotation.z = -h / 12 * Math.PI * 2;
    };
    g.userData.atualizar(new Date(2026, 0, 1, 10, 10, 30));
    return g;
  }

  function vasoGeo(alt, raio) {
    const pts = [[0, 0], [raio * 0.62, 0], [raio * 0.8, alt * 0.25], [raio * 0.95, alt * 0.7], [raio, alt * 0.95], [raio * 1.06, alt], [raio * 0.97, alt]]
      .map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(pts, 40);
  }

  function folhagem(g, alturaVaso, raioVaso, n, alt, sem) {
    const r = rnd(sem), verdes = ['#15803d', '#16a34a', '#22c55e', '#166534'];
    const terra = new THREE.Mesh(new THREE.CircleGeometry(raioVaso * 0.95, 32), std('#3f2a1d', { roughness: 1 }));
    terra.rotation.x = -Math.PI / 2; terra.position.y = alturaVaso * 0.96; g.add(terra);
    for (let i = 0; i < n; i++) {
      const ang = i / n * Math.PI * 2 + r() * 0.5, incl = 0.12 + r() * 0.38, comp = alt * (0.6 + r() * 0.4);
      const haste = new THREE.Group();
      haste.position.y = alturaVaso * 0.95; haste.rotation.set(0, ang, -incl);
      const caule = new THREE.Mesh(new THREE.CylinderGeometry(comp * 0.012, comp * 0.02, comp, 6), std('#4d7c0f'));
      caule.position.y = comp / 2; haste.add(caule);
      const folha = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), std(verdes[i % 4], { roughness: 0.55, side: THREE.DoubleSide }));
      folha.scale.set(comp * 0.32, comp * 0.03, comp * 0.18); folha.position.set(comp * 0.22, comp, 0); folha.rotation.z = -0.5;
      haste.add(folha); g.add(haste);
    }
  }

  const CORES_VASO = ['#c2410c', '#f1f5f9', '#1f2937'];

  function vaso(v) {
    const g = new THREE.Group();
    const corpo = new THREE.Mesh(vasoGeo(0.42, 0.2), std(CORES_VASO[v % 3], { roughness: 0.5, side: THREE.DoubleSide }));
    g.add(corpo);
    folhagem(g, 0.42, 0.2, 11, 0.6, 17 + v);
    return g;
  }

  function prateleira(v) {
    const g = new THREE.Group();
    const madeira = std(['#a16207', '#f8fafc', '#334155'][v % 3], { roughness: 0.55 });
    const tabua = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.2), madeira); tabua.position.set(0, 0, 0.1);
    g.add(tabua);
    for (const x of [-0.25, 0.25]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.12, 0.025), std('#1f2937')); m.position.set(x, -0.075, 0.0125); g.add(m);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.16), std('#1f2937')); b.position.set(x, -0.028, 0.08); g.add(b); }
    // vasinho com planta
    const vg = new THREE.Group(); vg.position.set(-0.18, 0.015, 0.1);
    vg.add(new THREE.Mesh(vasoGeo(0.12, 0.06), std(CORES_VASO[(v + 1) % 3], { side: THREE.DoubleSide })));
    folhagem(vg, 0.12, 0.06, 7, 0.2, 23);
    g.add(vg);
    // livros
    const cores = ['#dc2626', '#2563eb', '#ca8a04', '#0d9488'];
    let x = 0.06;
    for (let i = 0; i < 4; i++) {
      const alt = 0.17 + (i % 2) * 0.03, esp = 0.025 + (i % 3) * 0.008;
      const l = new THREE.Mesh(new THREE.BoxGeometry(esp, alt, 0.13), std(cores[i], { roughness: 0.7 }));
      l.position.set(x, 0.015 + alt / 2, 0.1); x += esp + 0.004; g.add(l);
    }
    const deitado = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.11), std('#7c3aed', { roughness: 0.7 }));
    deitado.position.set(0.26, 0.03, 0.1); g.add(deitado);
    return g;
  }

  const TIPOS = {
    quadro: { nome: 'Quadro', emoji: '🖼️', local: 'parede', variantes: 3, criar: quadro },
    relogio: { nome: 'Relógio', emoji: '🕰️', local: 'parede', variantes: 2, criar: relogio },
    prateleira: { nome: 'Prateleira', emoji: '📚', local: 'parede', variantes: 3, criar: prateleira },
    vaso: { nome: 'Vaso (chão)', emoji: '🪴', local: 'chao', variantes: 3, criar: vaso },
  };

  window.Moveis = { TIPOS, criar: (tipo, v = 0) => TIPOS[tipo].criar(v) };
})(window.THREE_MOVEIS || AFRAME.THREE);
