/*
 * MODO SIMULADOR (index.html?sim): troca a câmera por uma parede virtual.
 * "Apontar para uma placa" mostra a imagem da placa na parede e dispara o mesmo
 * evento targetFound que o MindAR dispara no iPhone. O resto do app é idêntico.
 * Serve para ver e ensaiar no PC; o vídeo da atividade deve ser gravado no iPhone.
 */
(function () {
  const cena = document.getElementById('cena');
  const alvos = [...document.querySelectorAll('[data-comodo]')];
  let atual = null;
  let orbitaX = 0, orbitaY = 0, arrastando = false, ultimo = null;
  // escala real: 1 unidade = largura da placa impressa (17 cm)
  const LARG = window.CASA.larguraPlaca || 0.17, CHAO = -(window.CASA.alturaPlaca || 1.5) / LARG;
  let R = 2.5, centroY = 0; // distância e altura do "celular" (mudam no modo Decorar e com a rodinha do mouse)
  let zoomManual = null;

  document.getElementById('avisoHttps').hidden = true;
  document.body.classList.add('simulacao');

  function preparar() {
    cena.setAttribute('background', 'color: #cfc6b8');
    // parede, rodapé e chão em escala real
    const plano = (w, h, pos, rot, cor) => {
      const e = document.createElement('a-plane');
      e.setAttribute('width', w); e.setAttribute('height', h);
      e.setAttribute('position', pos); if (rot) e.setAttribute('rotation', rot);
      e.setAttribute('material', `color: ${cor}; shader: flat`);
      cena.appendChild(e);
    };
    plano(90, 50, `0 ${CHAO + 25} -0.01`, null, '#e8e1d4');
    plano(90, 0.6, `0 ${CHAO + 0.3} 0.02`, null, '#9a8c78');
    plano(90, 40, `0 ${CHAO} 20`, '-90 0 0', '#b08968');
    // imagem da placa em cada alvo
    for (const el of alvos) {
      const img = document.createElement('a-plane');
      img.setAttribute('width', 1); img.setAttribute('height', 1);
      img.setAttribute('material', `src: marcadores/${el.dataset.comodo}.png; shader: flat`);
      el.appendChild(img);
      el.object3D.visible = false;
    }
    const cam = document.querySelector('a-camera');
    cam.removeAttribute('look-controls');
    cam.setAttribute('camera', 'fov', 55);
    // câmera "na mão": balança um pouco e dá para arrastar
    {
      const tick = t => {
        const s = t / 1000;
        const ax = orbitaX + Math.sin(s * 0.7) * 0.06, ay = orbitaY + Math.sin(s * 0.5) * 0.03 + 0.1;
        const dec = document.body.classList.contains('decorando');
        R += ((zoomManual || (dec ? 26 : 2.5)) - R) * 0.06;
        centroY += ((dec ? -5.5 : 0) - centroY) * 0.06;
        cam.object3D.position.set(Math.sin(ax) * R * Math.cos(ay), Math.sin(ay) * R - 0.2 + centroY, Math.cos(ax) * R * Math.cos(ay)); // -0.2: sobe a maquete na tela, acima do painel
        cam.object3D.rotation.set(-ay, ax, 0, 'YXZ'); // olha para a placa (no centro)
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    const tela = cena.canvas || document.body;
    const pos = e => (e.touches ? e.touches[0] : e);
    tela.addEventListener('pointerdown', e => {
      if (window.Decor && window.Decor.consumiu) return; // o toque foi num objeto da decoração
      arrastando = true; ultimo = pos(e);
    });
    tela.addEventListener('wheel', e => { e.preventDefault(); zoomManual = Math.max(1.5, Math.min(30, (zoomManual || R) * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
    document.getElementById('btnDecor').addEventListener('click', () => { zoomManual = null; });
    window.addEventListener('pointerup', () => { arrastando = false; });
    window.addEventListener('pointermove', e => {
      if (!arrastando) return;
      const p = pos(e);
      orbitaX = Math.max(-0.9, Math.min(0.9, orbitaX - (p.clientX - ultimo.clientX) * 0.005));
      orbitaY = Math.max(-0.5, Math.min(0.7, orbitaY + (p.clientY - ultimo.clientY) * 0.004));
      ultimo = p;
    });
  }
  if (cena.hasLoaded) preparar(); else cena.addEventListener('loaded', preparar);

  const espera = ms => new Promise(r => setTimeout(r, ms));

  // API usada pelos botões do simulador.html
  window.SIM = {
    async apontar(id) {
      if (atual === id) return;
      this.afastar();
      await espera(350);
      const el = alvos.find(e => e.dataset.comodo === id);
      el.object3D.visible = true;
      atual = id;
      await espera(500); // tempo de "reconhecer"
      if (atual === id) el.emit('targetFound');
    },
    zoom(r) { zoomManual = r; },
    afastar() {
      if (!atual) return;
      const el = alvos.find(e => e.dataset.comodo === atual);
      el.object3D.visible = false;
      atual = null;
      el.emit('targetLost');
    },
    clicar(texto) {
      const b = [...document.querySelectorAll('#destinos .chip')].find(x => x.textContent.includes(texto));
      if (b) b.click();
    },
    async demo(passo) {
      const p = passo || (() => {});
      p('1/6 · Apontando para a placa da SALA'); await this.apontar('sala'); await espera(3500);
      p('2/6 · Escolhendo destino: BANHEIRO'); this.clicar('Banheiro'); await espera(3500);
      p('3/6 · Escolhendo destino: COZINHA'); this.clicar('Cozinha'); await espera(3500);
      p('4/6 · Tirando a câmera da placa (app lembra a posição)'); this.afastar(); await espera(2500);
      p('5/6 · Andou até a cozinha e apontou para a placa: CHEGOU!'); await this.apontar('cozinha'); await espera(4500);
      p('6/6 · Emergência: botão 🚨 Saída'); this.clicar('Saída'); await espera(3000);
      p('Fim da demonstração ✔');
    },
    async decorar(passo) {
      const p = passo || (() => {});
      const D = window.Decor;
      p('1/6 · Apontando para a placa da SALA'); await this.apontar('sala'); await espera(1500);
      p('2/6 · Tocando em 🛋️ (modo Decorar)'); if (!D.ativo) document.getElementById('btnDecor').click(); await espera(2500);
      D.limpar(); // recomeça a demonstração com a parede vazia
      p('3/6 · Quadro na parede, à esquerda da placa'); D.armar('quadro'); await espera(900); D.colocar('quadro', -0.55, 0.05); await espera(1800);
      p('4/6 · Relógio e prateleira à direita'); D.colocar('relogio', 0.42, 0.28); await espera(1200); D.colocar('prateleira', 0.5, -0.3); await espera(1800);
      p('5/6 · Vaso com planta no chão'); D.colocar('vaso', -0.95, 0); await espera(1800);
      p('6/6 · Toque em 📱 para o AR nativo do iPhone (sem placa)');
      await espera(1500);
      p('Fim ✔ · arraste os objetos com o mouse, use − + e 🎨');
    },
  };
})();
