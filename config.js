/*
 * CONFIGURAÇÃO DA CASA — edite aqui para ficar igual à SUA casa.
 *
 * A planta usa metros. O eixo x cresce para a direita (Leste) e o eixo y
 * cresce para baixo (Sul), como num desenho visto de cima.
 *
 * artigo   = 'a' ou 'o' (para escrever "na sala", "no quarto").
 * alvo     = número da placa (0 = SALA, 1 = COZINHA, 2 = QUARTO, 3 = BANHEIRO).
 *            É a ordem das imagens em marcadores/ e no targets.mind.
 * parede   = em qual parede do cômodo a placa está colada:
 *            'N' (norte/cima da planta), 'S' (sul/baixo), 'L' (leste/direita), 'O' (oeste/esquerda).
 *            Isso faz a maquete 3D e a seta apontarem para o lado certo no mundo real.
 * saida    = (opcional) marca o cômodo da SAÍDA e 'porta' é o ponto da porta da rua.
 *            Ativa o botão 🚨 Saída (rota de emergência).
 * portas   = passagens entre cômodos (o ponto fica sobre a parede comum).
 *
 * MODO DECORAR (🛋️): para os objetos aparecerem em TAMANHO REAL na parede, o app
 * precisa saber o tamanho da placa impressa e a altura em que ela foi colada.
 * larguraPlaca = largura da IMAGEM impressa, em metros (a folha A4 do marcadores.html sai com 17 cm).
 * alturaPlaca  = altura do CENTRO da placa até o chão, em metros (usada para pôr o vaso no chão).
 */
window.CASA = {
  nome: 'Minha Casa',
  larguraPlaca: 0.17,
  alturaPlaca: 1.5,

  comodos: [
    { id: 'sala',     nome: 'Sala',     artigo: 'a',     cor: '#2563eb', x: 0, y: 0, w: 5, h: 4, alvo: 0, parede: 'N',
      info: 'Sofá, TV e porta de entrada.',
      saida: 'A porta de entrada fica na parede oeste da sala.', porta: { x: 0, y: 2 } },
    { id: 'cozinha',  nome: 'Cozinha',  artigo: 'a',  cor: '#ea580c', x: 5, y: 0, w: 4, h: 4, alvo: 1, parede: 'L',
      info: 'Geladeira, fogão e mesa de refeições.' },
    { id: 'quarto',   nome: 'Quarto',   artigo: 'o',   cor: '#7c3aed', x: 0, y: 4, w: 5, h: 4, alvo: 2, parede: 'S',
      info: 'Cama, guarda-roupa e escrivaninha.' },
    { id: 'banheiro', nome: 'Banheiro', artigo: 'o', cor: '#0d9488', x: 5, y: 4, w: 4, h: 4, alvo: 3, parede: 'L',
      info: 'Pia, chuveiro e armário de remédios.' },
  ],

  portas: [
    { entre: ['sala', 'cozinha'],     x: 5,   y: 2 },
    { entre: ['sala', 'quarto'],      x: 2.5, y: 4 },
    { entre: ['cozinha', 'banheiro'], x: 7,   y: 4 },
  ],
};
