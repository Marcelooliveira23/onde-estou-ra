/*
 * MINIMAPA 3D NO CANTO DA TELA, "similar a um jogo 3D" (como pede o exemplo do professor).
 * Uma segunda cena three.js, pequena, com a planta da casa em 3D, o boneco do
 * jogador virado para onde a pessoa está olhando (para a placa) e a rota até o destino.
 * A câmera fica atrás do jogador, em terceira pessoa, como nos games.
 */
(function () {
  const THREE = AFRAME.THREE;
  const { C, porId, centro, placa } = window.Casa;
  const { etiqueta, paredesCasa } = window.Geo3D;

  let renderer, cena, camera, canvas, pisos = {}, jogador, anel, grupoRota, bolinhas = [], pts = [], acum = [];
  let alvoCam = new THREE.Vector3(), posCam = new THREE.Vector3(), olharCam = new THREE.Vector3(), posDesejada = new THREE.Vector3();
  let atual = null, ativo = false;

  let maxX = 0, maxY = 0;
  for (const k of C.comodos) { maxX = Math.max(maxX, k.x + k.w); maxY = Math.max(maxY, k.y + k.h); }
  const cx = maxX / 2, cy = maxY / 2;
  const p3 = p => new THREE.Vector3(p.x - cx, 0, p.y - cy); // planta -> 3D (norte = -z)

  function iniciar(cv) {
    canvas = cv;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    cena = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    cena.add(new THREE.HemisphereLight('#ffffff', '#64748b', 2.2));
    const sol = new THREE.DirectionalLight('#ffffff', 1.8); sol.position.set(4, 10, 6); cena.add(sol);

    const terreno = new THREE.Mesh(new THREE.BoxGeometry(maxX + 1.2, 0.3, maxY + 1.2), new THREE.MeshStandardMaterial({ color: '#cbd5e1' }));
    terreno.position.y = -0.2; cena.add(terreno);
    for (const k of C.comodos) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(k.w - 0.1, 0.1, k.h - 0.1),
        new THREE.MeshStandardMaterial({ color: k.cor, emissive: k.cor, emissiveIntensity: 0 }));
      m.position.copy(p3(centro(k)));
      cena.add(m); pisos[k.id] = m;
      const et = etiqueta(k.nome.toUpperCase(), { cor: k.cor, fundo: 'rgba(255,255,255,0.92)', escala: 0.75 });
      et.position.copy(p3(centro(k))).setY(1.6);
      cena.add(et);
    }
    paredesCasa(C, p3, cena, 0.9);
    const saida = C.comodos.find(k => k.saida && k.porta);
    if (saida) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.9), new THREE.MeshStandardMaterial({ color: '#dc2626', emissive: '#dc2626', emissiveIntensity: 0.4 }));
      t.position.copy(p3(saida.porta)).setY(0.06); cena.add(t);
    }

    // jogador: corpo + cabeça + "nariz" que mostra para onde está olhando
    jogador = new THREE.Group();
    const vermelho = new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 0.3 });
    const corpo = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.9, 20), vermelho); corpo.position.y = 0.55;
    const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 14), new THREE.MeshStandardMaterial({ color: '#fde2c8' })); cabeca.position.y = 1.2;
    const visao = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#fde047', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
    visao.rotation.x = -Math.PI / 2; visao.position.set(0, 1.1, -0.9); // cone de visão para a frente (-z)
    jogador.add(corpo, cabeca, visao);
    jogador.scale.setScalar(1.5);
    cena.add(jogador);
    anel = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 32), new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, side: THREE.DoubleSide }));
    anel.rotation.x = -Math.PI / 2; cena.add(anel);

    grupoRota = new THREE.Group(); cena.add(grupoRota);
    posCam.set(0, 14, 10); olharCam.set(0, 0, 0);
    ativo = true;
    requestAnimationFrame(loop);
  }

  function atualizar(e) {
    if (!renderer) return;
    if (e.atual !== atual) {
      atual = e.atual;
      const c = porId[atual], pl = placa(c);
      const eu = p3({ x: pl.p.x + pl.n.x * 0.9, y: pl.p.y + pl.n.y * 0.9 });
      jogador.position.copy(eu);
      anel.position.copy(eu).setY(0.12);
      jogador.rotation.y = Math.atan2(-pl.f.x, -pl.f.y); // olhando para a placa
      // câmera em terceira pessoa: atrás e acima do jogador
      const atras = new THREE.Vector3(-pl.f.x, 0, -pl.f.y).multiplyScalar(9.5);
      alvoCam.copy(eu).lerp(new THREE.Vector3(0, 0, 0), 0.6);
      posDesejada.copy(alvoCam).add(atras).setY(13);
    }
    for (const id in pisos) pisos[id].material.emissiveIntensity = 0;
    // rota
    while (grupoRota.children.length) grupoRota.remove(grupoRota.children[0]);
    bolinhas = []; pts = []; acum = [];
    if (e.pontos) {
      const cor = e.emergencia ? '#dc2626' : '#16a34a';
      pts = [jogador.position.clone(), ...e.pontos.slice(1).map(p3)].map(v => v.setY(0.3));
      acum = [0];
      for (let i = 1; i < pts.length; i++) {
        acum.push(acum[i - 1] + pts[i].distanceTo(pts[i - 1]));
        const a = pts[i - 1], b = pts[i], L = a.distanceTo(b);
        const fita = new THREE.Mesh(new THREE.BoxGeometry(L, 0.06, 0.32), new THREE.MeshBasicMaterial({ color: e.emergencia ? '#fca5a5' : '#86efac' }));
        fita.position.set((a.x + b.x) / 2, 0.14, (a.z + b.z) / 2);
        fita.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
        grupoRota.add(fita);
      }
      const mat = new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 0.7 });
      const n = Math.max(5, Math.round(acum[acum.length - 1] * 1.6));
      for (let i = 0; i < n; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat); grupoRota.add(b); bolinhas.push(b); }
      const fim = pts[pts.length - 1];
      const bandeira = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 4), mat);
      bandeira.rotation.x = Math.PI; bandeira.position.copy(fim).setY(1.2);
      grupoRota.add(bandeira);
      grupoRota.userData.bandeira = bandeira;
    }
  }

  function loop(t) {
    if (!ativo) return;
    requestAnimationFrame(loop);
    if (!canvas.offsetParent) return; // escondido (modo 2D ou sem cômodo)
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    const s = t / 1000;
    posCam.lerp(posDesejada, 0.06); olharCam.lerp(alvoCam, 0.06);
    camera.position.copy(posCam); camera.lookAt(olharCam);
    jogador.position.y = Math.abs(Math.sin(s * 4)) * 0.12; // "andando parado", como personagem de game
    const k = (s % 1.2) / 1.2; anel.scale.setScalar(0.8 + k * 1.4); anel.material.opacity = 0.9 * (1 - k);
    if (atual) pisos[atual].material.emissiveIntensity = 0.25 + 0.25 * Math.sin(s * 4);
    if (bolinhas.length) {
      const total = acum[acum.length - 1];
      bolinhas.forEach((b, i) => {
        const d = ((i / bolinhas.length) * total + s * 2) % total;
        let j = 1; while (j < acum.length - 1 && acum[j] < d) j++;
        const u = (d - acum[j - 1]) / (acum[j] - acum[j - 1] || 1);
        b.position.lerpVectors(pts[j - 1], pts[j], u).setY(0.35);
      });
      const bd = grupoRota.userData.bandeira; if (bd) { bd.rotation.y = s * 2; bd.position.y = 1.2 + Math.sin(s * 3) * 0.15; }
    }
    renderer.render(cena, camera);
  }

  window.Minimapa3D = { iniciar, atualizar };
})();
