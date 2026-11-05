/*
 * SEM ZOOM ACIDENTAL (iPhone): o Safari ignora o "user-scalable=no" da página. Quando os dois dedos
 * (girar/redimensionar um objeto) pegam um botão ou o painel, ou num toque duplo, ele amplia a PÁGINA
 * inteira e você perde o controle. Aqui:
 *   1. os gestos de pinça do Safari (gesturestart/change) são cancelados;
 *   2. arrastar com 2 ou mais dedos não rola nem amplia a página (os objetos 3D continuam recebendo o gesto);
 *   3. toque duplo não amplia (touch-action: manipulation);
 *   4. se mesmo assim a página ficar ampliada, ela volta sozinha ao tamanho normal.
 */
(function () {
  const css = document.createElement('style');
  css.textContent = 'html, body { touch-action: manipulation; -webkit-text-size-adjust: 100%; } button, a, input, label { touch-action: manipulation; }';
  document.head.appendChild(css);
  const parar = e => { e.preventDefault(); };
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, parar, { passive: false });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  // se a página ficou ampliada (zoom do Safari), volta para 100%
  const meta = document.querySelector('meta[name="viewport"]');
  const normal = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
  let t = 0;
  function voltar() {
    const vv = window.visualViewport; if (!vv || vv.scale <= 1.02 || !meta) return;
    clearTimeout(t);
    t = setTimeout(() => { // trocar o conteúdo do viewport faz o Safari voltar à escala 1
      meta.setAttribute('content', normal.replace('initial-scale=1', 'initial-scale=1.0001'));
      setTimeout(() => meta.setAttribute('content', normal), 60);
    }, 250);
  }
  if (window.visualViewport) { visualViewport.addEventListener('resize', voltar); visualViewport.addEventListener('scroll', voltar); }
})();
