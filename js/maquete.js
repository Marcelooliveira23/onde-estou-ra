/*
 * Componente A-Frame "maquete-casa": monta, em cima da placa reconhecida,
 * uma maquete 3D da casa girada para ficar alinhada com a casa real,
 * com o pino "VOCÊ ESTÁ AQUI", a seta de direção e a rota animada.
 */
(function () {
  const THREE = AFRAME.THREE;
  const ESCALA_ALTURA_PAREDE = 0.9; // metros (baixa, para enxergar dentro)
  const VAO_PORTA = 0.9;            // metros

  // Etiqueta de texto desenhada num canvas (não depende de fontes externas)
  function etiqueta(texto, { cor = '#111827', fundo = '#ffffff', alturaPx = 64, escala = 0.1 } = {}) {
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    const fonte = `bold ${alturaPx}px -apple-system, "Segoe UI", Arial, sans-serif`;
    ctx.font = fonte;
    const w = Math.ceil(ctx.measureText(texto).width) + alturaPx;
    cv.width = w; cv.height = Math.ceil(alturaPx * 1.6);
    ctx.font = fonte;
    const raio = cv.height / 2;
    ctx.fillStyle = fundo;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(0, 0, w, cv.height, raio) : ctx.rect(0, 0, w, cv.height);
    ctx.fill();
    ctx.fillStyle = cor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(texto, w / 2, cv.height / 2 + 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.renderOrder = 10;
    sp.scale.set(escala * w / cv.height, escala, 1);
    return sp;
  }

  function seta(cor) {
    const s = new THREE.Shape();
    s.moveTo(0, 0.6); s.lineTo(0.45, 0.05); s.lineTo(0.18, 0.05); s.lineTo(0.18, -0.6);
    s.lineTo(-0.18, -0.6); s.lineTo(-0.18, 0.05); s.lineTo(-0.45, 0.05); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03 });
    g.translate(0, 0, -0.09);
    g.rotateX(-Math.PI / 2); // deitada no piso, apontando para -z (frente)
    return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 0.35, roughness: 0.4 }));
  }

  // Paredes de todos os cômodos, deixando vãos nas portas (e na porta da rua).
  // p3 converte um ponto da planta (metros) para o espaço 3D desejado.
  function paredesCasa(C, p3, grupo, altura) {
    const mat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.8 });
    const parede = (p, q) => {
      const a = p3(p), b = p3(q);
      const L = a.distanceTo(b); if (L < 0.05) return;
      const m = new THREE.Mesh(new THREE.BoxGeometry(L, altura, 0.12), mat);
      m.position.set((a.x + b.x) / 2, altura / 2, (a.z + b.z) / 2);
      m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      grupo.add(m);
    };
    const saida = C.comodos.find(k => k.saida && k.porta);
    const todasPortas = saida ? [...C.portas, { entre: [saida.id], x: saida.porta.x, y: saida.porta.y }] : C.portas;
    for (const k of C.comodos) {
      const cantos = [[k.x, k.y], [k.x + k.w, k.y], [k.x + k.w, k.y + k.h], [k.x, k.y + k.h]];
      for (let i = 0; i < 4; i++) {
        const [x1, y1] = cantos[i], [x2, y2] = cantos[(i + 1) % 4];
        const horiz = y1 === y2;
        const cortes = todasPortas.filter(pt => pt.entre.includes(k.id) &&
          (horiz ? Math.abs(pt.y - y1) < 1e-6 && pt.x > Math.min(x1, x2) && pt.x < Math.max(x1, x2)
                 : Math.abs(pt.x - x1) < 1e-6 && pt.y > Math.min(y1, y2) && pt.y < Math.max(y1, y2)))
          .map(pt => horiz ? pt.x : pt.y).sort((u, v) => u - v);
        let ini = horiz ? Math.min(x1, x2) : Math.min(y1, y2);
        const fim = horiz ? Math.max(x1, x2) : Math.max(y1, y2);
        const P = t => horiz ? { x: t, y: y1 } : { x: x1, y: t };
        for (const cc of cortes) { parede(P(ini), P(cc - VAO_PORTA / 2)); ini = cc + VAO_PORTA / 2; }
        parede(P(ini), P(fim));
      }
    }
  }
  window.Geo3D = { etiqueta, paredesCasa };

  AFRAME.registerComponent('maquete-casa', {
    schema: { comodo: { type: 'string' } },

    init() {
      const { C, porId, placa, paraPlaca, centro } = window.Casa;
      this.c = porId[this.data.comodo];
      const c = this.c;

      // Tamanho da casa inteira no referencial da placa, para centralizar e escalar
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const k of C.comodos) for (const [px, py] of [[k.x, k.y], [k.x + k.w, k.y], [k.x, k.y + k.h], [k.x + k.w, k.y + k.h]]) {
        const q = paraPlaca(c, { x: px, y: py });
        minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minZ = Math.min(minZ, q.z); maxZ = Math.max(maxZ, q.z);
      }
      const esc = 0.85 / Math.max(maxX - minX, maxZ - minZ);
      const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
      this.p3 = pt => { const q = paraPlaca(c, pt); return new THREE.Vector3((q.x - cx), 0, (q.z - cz)); };

      // raiz: inclinada para a câmera (frente da casa = para cima da placa)
      const raiz = new THREE.Group();
      raiz.rotation.x = THREE.MathUtils.degToRad(58);
      raiz.position.set(0, 0.02, 0.18);
      const casa = new THREE.Group();
      casa.scale.setScalar(esc);
      raiz.add(casa);
      this.casa = casa; this.esc = esc; this.raiz = raiz;

      // base (terreno)
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(maxX - minX + 0.8, 0.25, maxZ - minZ + 0.8),
        new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.9 }));
      base.position.y = -0.2;
      casa.add(base);

      // pisos dos cômodos
      this.pisos = {};
      for (const k of C.comodos) {
        const atual = k.id === c.id;
        const cor = new THREE.Color(k.cor);
        const mat = new THREE.MeshStandardMaterial({
          color: atual ? cor : cor.clone().lerp(new THREE.Color('#ffffff'), 0.55),
          emissive: atual ? cor : new THREE.Color('#000000'), emissiveIntensity: atual ? 0.25 : 0, roughness: 0.7 });
        const a = this.p3({ x: k.x, y: k.y }), b = this.p3({ x: k.x + k.w, y: k.y + k.h });
        const piso = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(b.x - a.x) - 0.08, 0.08, Math.abs(b.z - a.z) - 0.08), mat);
        const m = this.p3(centro(k)); piso.position.set(m.x, 0, m.z);
        casa.add(piso);
        this.pisos[k.id] = piso;
        const et = etiqueta(k.nome.toUpperCase(), { cor: atual ? '#ffffff' : k.cor, fundo: atual ? k.cor : 'rgba(255,255,255,0.92)', escala: 0.055 / esc * (atual ? 1.25 : 1) });
        et.position.set(m.x, 1.6, m.z);
        if (!atual) casa.add(et); // o atual ganha a etiqueta do pino
      }

      // paredes com vãos nas portas (função compartilhada com o minimapa 3D)
      const saida = C.comodos.find(k => k.saida && k.porta);
      paredesCasa(C, this.p3, casa, ESCALA_ALTURA_PAREDE);

      // porta da rua: tapete vermelho + etiqueta SAÍDA
      if (saida) {
        const pp = this.p3(saida.porta);
        const tapete = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 1.0), new THREE.MeshStandardMaterial({ color: '#dc2626', emissive: '#dc2626', emissiveIntensity: 0.3 }));
        tapete.position.set(pp.x, 0.05, pp.z);
        const et = etiqueta('🚪 SAÍDA', { cor: '#ffffff', fundo: '#dc2626', escala: 0.035 / esc });
        et.position.set(pp.x, 1.3, pp.z);
        casa.add(tapete, et);
      }

      // placa na parede (retângulo amarelo onde a imagem está colada)
      const pl = placa(c);
      const posPlaca = this.p3(pl.p);
      const quadro = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.16), new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#facc15', emissiveIntensity: 0.4 }));
      quadro.position.set(posPlaca.x, 0.75, posPlaca.z);
      casa.add(quadro);

      // pino "você está aqui" (um pouco para dentro do cômodo)
      const dentro = this.p3({ x: pl.p.x + pl.n.x * 0.9, y: pl.p.y + pl.n.y * 0.9 });
      const pino = new THREE.Group();
      const corPino = new THREE.Color('#ef4444');
      const matPino = new THREE.MeshStandardMaterial({ color: corPino, emissive: corPino, emissiveIntensity: 0.35, roughness: 0.35 });
      const esfera = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), matPino); esfera.position.y = 1.55;
      const ponta = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 24), matPino); ponta.rotation.x = Math.PI; ponta.position.y = 1.0;
      const miolo = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), new THREE.MeshStandardMaterial({ color: '#ffffff' })); miolo.position.set(0, 1.6, 0.33);
      pino.add(esfera, ponta, miolo);
      const anel = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.65, 40), new THREE.MeshBasicMaterial({ color: corPino, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
      anel.rotation.x = -Math.PI / 2; anel.position.y = 0.06;
      pino.position.copy(dentro);
      anel.position.x = dentro.x; anel.position.z = dentro.z;
      casa.add(pino, anel);
      const etAqui = etiqueta('📍 VOCÊ ESTÁ AQUI', { cor: '#ffffff', fundo: '#ef4444', escala: 0.045 / esc });
      etAqui.position.set(dentro.x, 2.7, dentro.z);
      casa.add(etAqui);
      this.pino = pino; this.anel = anel; this.dentro = dentro;

      // grupo da rota (refeito quando o destino muda)
      this.grupoRota = new THREE.Group();
      casa.add(this.grupoRota);

      // luzes próprias (a cena RA não tem ambiente)
      const luzA = new THREE.HemisphereLight('#ffffff', '#64748b', 1.6);
      const luzD = new THREE.DirectionalLight('#ffffff', 1.6); luzD.position.set(0.5, 1.5, 1);
      raiz.add(luzA, luzD);

      this.el.setObject3D('maquete', raiz);
      raiz.scale.setScalar(0.001);
      this.surgir = 0;
      this.t = 0;

      this.el.addEventListener('targetFound', () => { this.surgir = 0.001; });
    },

    definirDestino(destId, emergencia) {
      const THREE_ = THREE;
      const g = this.grupoRota;
      while (g.children.length) g.remove(g.children[0]);
      this.pontosRota = null;
      if (!destId || destId === this.c.id) return null;
      const saida = window.Casa.C.comodos.find(k => k.saida);
      const r = window.Casa.rota(this.c.id, destId, emergencia && saida && saida.porta);
      if (!r) return null;
      const pts = [this.dentro.clone(), ...r.pontos.slice(1).map(p => this.p3(p))];
      pts.forEach(p => { p.y = 0.25; });
      this.pontosRota = pts;
      // comprimento acumulado para animar as bolinhas
      this.acum = [0];
      for (let i = 1; i < pts.length; i++) this.acum.push(this.acum[i - 1] + pts[i].distanceTo(pts[i - 1]));
      const corR = new THREE_.Color(emergencia ? '#dc2626' : '#16a34a');
      // trilha
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], L = a.distanceTo(b);
        const fita = new THREE_.Mesh(new THREE_.BoxGeometry(L, 0.04, 0.28), new THREE_.MeshBasicMaterial({ color: emergencia ? '#fca5a5' : '#86efac', transparent: true, opacity: 0.9 }));
        fita.position.set((a.x + b.x) / 2, 0.08, (a.z + b.z) / 2);
        fita.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
        g.add(fita);
      }
      // bolinhas que andam pela trilha
      this.bolinhas = [];
      const matB = new THREE_.MeshStandardMaterial({ color: corR, emissive: corR, emissiveIntensity: 0.6 });
      const n = Math.max(6, Math.round(this.acum[this.acum.length - 1] * 2.2));
      for (let i = 0; i < n; i++) { const b = new THREE_.Mesh(new THREE_.SphereGeometry(0.16, 12, 8), matB); g.add(b); this.bolinhas.push(b); }
      // bandeira no destino
      const fim = pts[pts.length - 1];
      const mastro = new THREE_.Mesh(new THREE_.CylinderGeometry(0.05, 0.05, 1.8), new THREE_.MeshStandardMaterial({ color: '#334155' }));
      mastro.position.set(fim.x, 0.9, fim.z);
      const bandeira = new THREE_.Mesh(new THREE_.BoxGeometry(0.75, 0.45, 0.04), matB);
      bandeira.position.set(fim.x + 0.38, 1.55, fim.z);
      g.add(mastro, bandeira);
      const dest = window.Casa.porId[destId];
      const et = etiqueta((emergencia ? '🚪 SAÍDA · ' : '🏁 ' + dest.nome.toUpperCase() + ' · ') + r.metros.toFixed(0) + ' m', { cor: '#ffffff', fundo: emergencia ? '#dc2626' : '#16a34a', escala: 0.045 / this.esc });
      et.position.set(fim.x, 3.4, fim.z);
      g.add(et);
      // seta grande saindo do pino na direção do primeiro trecho
      const s = seta(emergencia ? '#dc2626' : '#16a34a');
      const a = pts[0], b = pts[1];
      s.position.set(a.x, 0.35, a.z);
      s.rotation.y = Math.atan2(-(b.x - a.x), -(b.z - a.z));
      s.scale.setScalar(1.3);
      g.add(s);
      this.seta = s; this.setaBase = a.clone(); this.setaDir = new THREE_.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
      return r;
    },

    tick(t, dt) {
      if (!this.el.object3D.visible) return;
      const s = t / 1000;
      if (this.surgir > 0 && this.surgir < 1) {
        this.surgir = Math.min(1, this.surgir + (dt || 16) / 450);
        const e = 1 - Math.pow(1 - this.surgir, 3);
        this.raiz.scale.setScalar(Math.max(0.001, e));
      }
      this.pino.position.y = Math.sin(s * 3) * 0.18;
      this.pino.rotation.y = s * 1.5;
      const k = (s % 1.2) / 1.2;
      this.anel.scale.setScalar(0.8 + k * 1.2); this.anel.material.opacity = 0.85 * (1 - k);
      const piso = this.pisos[this.c.id];
      piso.material.emissiveIntensity = 0.2 + 0.2 * (0.5 + 0.5 * Math.sin(s * 4));
      if (this.pontosRota && this.bolinhas) {
        const total = this.acum[this.acum.length - 1];
        this.bolinhas.forEach((b, i) => {
          const d = ((i / this.bolinhas.length) * total + s * 1.6) % total;
          let j = 1; while (j < this.acum.length - 1 && this.acum[j] < d) j++;
          const u = (d - this.acum[j - 1]) / (this.acum[j] - this.acum[j - 1] || 1);
          b.position.lerpVectors(this.pontosRota[j - 1], this.pontosRota[j], u);
          b.position.y = 0.3;
        });
        const vai = (Math.sin(s * 5) * 0.5 + 0.5) * 0.5;
        this.seta.position.copy(this.setaBase).addScaledVector(this.setaDir, 0.5 + vai);
        this.seta.position.y = 0.35;
      }
    },
  });
})();
