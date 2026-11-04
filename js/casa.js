/*
 * Lógica da planta: geometria das placas, rotas entre cômodos e direções.
 * Não depende de 3D nem de câmera, para dar para testar e explicar separadamente.
 */
(function () {
  const C = window.CASA;
  const porId = Object.fromEntries(C.comodos.map(c => [c.id, c]));
  const porAlvo = Object.fromEntries(C.comodos.map(c => [c.alvo, c]));

  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const len = a => Math.hypot(a.x, a.y);
  const centro = c => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 });

  // Onde a placa está na planta e para onde ela "olha".
  // n = normal da parede apontando para DENTRO do cômodo (de onde a pessoa olha a placa)
  // f = para onde a pessoa está olhando (para a placa) = -n
  // r = direita da pessoa
  function placa(c) {
    const lados = {
      N: { p: { x: c.x + c.w / 2, y: c.y },       n: { x: 0, y: 1 } },
      S: { p: { x: c.x + c.w / 2, y: c.y + c.h }, n: { x: 0, y: -1 } },
      O: { p: { x: c.x,           y: c.y + c.h / 2 }, n: { x: 1, y: 0 } },
      L: { p: { x: c.x + c.w,     y: c.y + c.h / 2 }, n: { x: -1, y: 0 } },
    };
    const l = lados[c.parede] || lados.N;
    const f = { x: -l.n.x, y: -l.n.y };
    const r = { x: -f.y, y: f.x };
    return { p: l.p, n: l.n, f, r };
  }

  // Converte um ponto da planta para o referencial da placa (em metros):
  // x = para a direita da pessoa, z = em direção à pessoa (para fora da parede).
  function paraPlaca(c, pt) {
    const pl = placa(c);
    const d = sub(pt, pl.p);
    return { x: dot(d, pl.r), z: dot(d, pl.n) };
  }

  // Busca em largura pelas portas: menor número de cômodos atravessados.
  function rota(deId, paraId, pontoFinal) {
    const ant = { [deId]: null };
    const fila = [deId];
    while (fila.length) {
      const a = fila.shift();
      if (a === paraId) break;
      for (const pt of C.portas) {
        if (!pt.entre.includes(a)) continue;
        const b = pt.entre[0] === a ? pt.entre[1] : pt.entre[0];
        if (b in ant) continue;
        ant[b] = { de: a, porta: pt };
        fila.push(b);
      }
    }
    if (!(paraId in ant)) return null;
    const portas = [], caminho = [paraId];
    for (let k = paraId; ant[k]; k = ant[k].de) { portas.unshift(ant[k].porta); caminho.unshift(ant[k].de); }
    const pontos = [placa(porId[deId]).p, ...portas.map(p => ({ x: p.x, y: p.y })), pontoFinal || centro(porId[paraId])];
    let metros = 0;
    for (let i = 1; i < pontos.length; i++) metros += len(sub(pontos[i], pontos[i - 1]));
    // cômodos atravessados no meio do caminho (sem a origem e o destino)
    const passaPor = caminho.slice(1, -1).map(id => porId[id].nome);
    return { pontos, metros, passaPor };
  }

  // Direção do primeiro trecho, do ponto de vista de quem olha a placa.
  function direcao(deId, r) {
    const c = porId[deId];
    const a = paraPlaca(c, r.pontos[0]);
    const b = paraPlaca(c, r.pontos[1]);
    const v = { x: b.x - a.x, z: b.z - a.z };
    const ang = Math.atan2(v.x, -v.z) * 180 / Math.PI; // 0 = em frente, 90 = direita
    let texto, emoji;
    if (ang > -45 && ang <= 45) { texto = 'siga em frente'; emoji = '⬆️'; }
    else if (ang > 45 && ang <= 135) { texto = 'vá para a sua direita'; emoji = '➡️'; }
    else if (ang < -45 && ang >= -135) { texto = 'vá para a sua esquerda'; emoji = '⬅️'; }
    else { texto = 'vire-se: o caminho é atrás de você'; emoji = '⬇️'; }
    return { ang, texto, emoji };
  }

  window.Casa = { C, porId, porAlvo, centro, placa, paraPlaca, rota, direcao };
})();
