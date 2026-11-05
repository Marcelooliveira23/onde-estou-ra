/*
 * CATÁLOGO DE MÓVEIS E DECORAÇÃO
 * - Móveis, plantas e objetos: modelos 3D REAIS, escaneados por fotogrametria
 *   (Poly Haven, licença CC0), em tamanho real (metros).
 * - Quadros: fotos de obras de arte REAIS em domínio público (Wikimedia Commons),
 *   montadas numa moldura 3D com passe-partout.
 * - Relógio de parede: modelo feito em código, mostra a hora certa.
 *
 * Funciona com o three.js do A-Frame (localizador) e com o three.js em módulo (decorar sem placa).
 * Convenções depois de carregar:
 *   chão/mesa → base em y = 0, centralizado em x e z, frente para +z;
 *   parede    → costas em z = 0 (encostado na parede), centralizado em x e y, frente para +z.
 */
(function (THREE, GLTFLoader) {
  const BASE = (window.MOVEIS_BASE || '') + 'modelos/';
  const std = (cor, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: cor, roughness: 0.6 }, extra || {}));
  const NA_FRENTE = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 };

  // ---------- obras de arte (domínio público) ----------
  const ARTES = [
    { id: 'noite_estrelada', titulo: 'A Noite Estrelada', autor: 'Van Gogh, 1889', r: 44567 / 35291, moldura: '#1c1917' },
    { id: 'grande_onda', titulo: 'A Grande Onda de Kanagawa', autor: 'Hokusai, c. 1831', r: 3859 / 2594, moldura: '#3f2a1d' },
    { id: 'impressao', titulo: 'Impressão, Nascer do Sol', autor: 'Monet, 1872', r: 5773 / 4478, moldura: '#b08d3c' },
    { id: 'o_quarto', titulo: 'O Quarto em Arles', autor: 'Van Gogh, 1888', r: 30000 / 23803, moldura: '#1c1917' },
    { id: 'o_beijo', titulo: 'O Beijo', autor: 'Klimt, 1908', r: 7376 / 7401, moldura: '#b08d3c' },
    { id: 'perola', titulo: 'Moça com Brinco de Pérola', autor: 'Vermeer, c. 1665', r: 12285 / 14550, moldura: '#3f2a1d' },
    { id: 'nenufares', titulo: 'Nenúfares', autor: 'Monet, 1906', r: 2342 / 2250, moldura: '#f5f5f4' },
    { id: 'girassois', titulo: 'Os Girassóis', autor: 'Van Gogh, 1888', r: 3349 / 4226, moldura: '#b08d3c' },
  ];

  // ---------- catálogo ----------
  // dim = tamanho real aproximado (m) para o "fantasma" enquanto carrega
  // local: 'chao' (apoiado no chão), 'parede' (costas na parede) ou 'teto' (pendurado: topo no teto)
  // dim = tamanho real aproximado [largura, altura, profundidade] em metros (fantasma enquanto carrega e layout automático)
  // ph = modelo escaneado da Poly Haven (pasta modelos/3d/<ph>); gera = móvel paramétrico feito em código (moveis_proc.js)
  const TIPOS = {
    // Sala
    sofa:            { nome: 'Sofá capitonê',      cat: 'Sala',     local: 'chao',   gltf: 'sofa_02', dim: [1.8, 0.71, 0.82], usdz: 1 },
    sofa_moderno:    { nome: 'Sofá moderno',       cat: 'Sala',     local: 'chao',   gera: 'sofa_moderno', dim: [2.1, 0.86, 0.92] },
    sofa_classico:   { nome: 'Sofá clássico',      cat: 'Sala',     local: 'chao',   gltf: 'Sofa_01', dim: [1.57, 0.8, 0.66] },
    sofa_tecido:     { nome: 'Sofá de tecido',     cat: 'Sala',     local: 'chao',   gltf: 'sofa_03', dim: [2.0, 0.95, 0.9] },
    poltrona:        { nome: 'Poltrona',           cat: 'Sala',     local: 'chao',   gltf: 'ArmChair_01', dim: [0.85, 1.07, 0.77], usdz: 1 },
    poltrona_design: { nome: 'Poltrona design',    cat: 'Sala',     local: 'chao',   gltf: 'mid_century_lounge_chair', dim: [1.0, 1.17, 1.19], usdz: 1 },
    poltrona_moderna:{ nome: 'Poltrona de couro',  cat: 'Sala',     local: 'chao',   gltf: 'modern_arm_chair_01', dim: [0.82, 0.99, 1.02] },
    cadeira_balanco: { nome: 'Cadeira de balanço', cat: 'Sala',     local: 'chao',   gltf: 'Rockingchair_01', dim: [0.71, 0.99, 0.83] },
    puff:            { nome: 'Puff',               cat: 'Sala',     local: 'chao',   gltf: 'Ottoman_01', dim: [0.88, 0.62, 0.62], usdz: 1 },
    mesa_centro:     { nome: 'Mesa de centro',     cat: 'Sala',     local: 'chao',   gltf: 'CoffeeTable_01', dim: [1.54, 0.52, 0.97], usdz: 1 },
    mesa_centro_moderna: { nome: 'Mesa de centro moderna', cat: 'Sala', local: 'chao', gltf: 'modern_coffee_table_01', dim: [1.2, 0.39, 0.6] },
    mesa_centro_redonda: { nome: 'Mesa de centro redonda', cat: 'Sala', local: 'chao', gltf: 'coffee_table_round_01', dim: [0.9, 0.49, 0.9] },
    mesa_lateral:    { nome: 'Mesa lateral',       cat: 'Sala',     local: 'chao',   gltf: 'side_table_01', dim: [0.55, 0.55, 0.45], usdz: 1 },
    rack_tv:         { nome: 'Rack com TV 55"',    cat: 'Sala',     local: 'chao',   gera: 'rack_tv', dim: [1.8, 1.27, 0.42] },
    aparador:        { nome: 'Aparador / buffet',  cat: 'Sala',     local: 'chao',   gltf: 'modern_wooden_cabinet', dim: [2.0, 0.68, 0.52] },
    estante:         { nome: 'Estante',            cat: 'Sala',     local: 'chao',   gltf: 'wooden_display_shelves_01', girar: -Math.PI / 2, dim: [1.08, 1.56, 0.37], usdz: 1 },
    tapete:          { nome: 'Tapete',             cat: 'Sala',     local: 'chao',   gera: 'tapete', dim: [2.0, 0.012, 1.4] },
    // Quarto
    cama_casal:      { nome: 'Cama de casal',      cat: 'Quarto',   local: 'chao',   gera: 'cama_casal', dim: [1.72, 1.2, 2.08] },
    cama_solteiro:   { nome: 'Cama de solteiro',   cat: 'Quarto',   local: 'chao',   gera: 'cama_solteiro', dim: [1.02, 1.2, 1.98] },
    cama_classica:   { nome: 'Cama clássica',      cat: 'Quarto',   local: 'chao',   gltf: 'GothicBed_01', dim: [1.49, 1.53, 2.04] },
    guarda_roupa:    { nome: 'Guarda-roupa',       cat: 'Quarto',   local: 'chao',   gera: 'guarda_roupa', dim: [1.8, 2.1, 0.6] },
    criado_mudo:     { nome: 'Criado-mudo',        cat: 'Quarto',   local: 'chao',   gltf: 'ClassicNightstand_01', dim: [0.57, 0.7, 0.42] },
    criado_pintado:  { nome: 'Criado-mudo azul',   cat: 'Quarto',   local: 'chao',   gltf: 'painted_wooden_nightstand', dim: [0.5, 0.62, 0.51] },
    comoda:          { nome: 'Cômoda alta',        cat: 'Quarto',   local: 'chao',   gltf: 'drawer_cabinet', dim: [1.14, 1.88, 0.49], usdz: 1 },
    comoda_classica: { nome: 'Cômoda clássica',    cat: 'Quarto',   local: 'chao',   gltf: 'GothicCommode_01', dim: [1.2, 1.21, 0.58] },
    cortina:         { nome: 'Cortina',            cat: 'Quarto',   local: 'parede', gera: 'cortina', dim: [2.2, 2.4, 0.12], alturaCentro: 1.3 },
    // Cozinha e jantar
    balcao_cozinha:  { nome: 'Balcão com pia e cooktop', cat: 'Cozinha', local: 'chao', gera: 'balcao_cozinha', dim: [2.02, 1.2, 0.62] },
    armario_aereo:   { nome: 'Armário aéreo',      cat: 'Cozinha',  local: 'parede', gera: 'armario_aereo', dim: [1.2, 0.7, 0.35], alturaCentro: 1.85 },
    geladeira:       { nome: 'Geladeira',          cat: 'Cozinha',  local: 'chao',   gera: 'geladeira', dim: [0.7, 1.85, 0.75] },
    fogao:           { nome: 'Fogão',              cat: 'Cozinha',  local: 'chao',   gltf: 'electric_stove', dim: [0.5, 0.86, 0.65] },
    mesa_jantar:     { nome: 'Mesa de jantar',     cat: 'Cozinha',  local: 'chao',   gera: 'mesa_jantar', dim: [1.6, 0.77, 0.9] },
    mesa_toalha:     { nome: 'Mesa com toalha',    cat: 'Cozinha',  local: 'chao',   gltf: 'dining_table', dim: [2.0, 0.88, 1.2] },
    mesa_bistro:     { nome: 'Mesa bistrô',        cat: 'Cozinha',  local: 'chao',   gltf: 'round_wooden_table_01', dim: [0.9, 0.78, 0.9] },
    cadeira_jantar:  { nome: 'Cadeira de jantar',  cat: 'Cozinha',  local: 'chao',   gltf: 'dining_chair_02', dim: [0.43, 0.97, 0.58] },
    banqueta:        { nome: 'Banqueta',           cat: 'Cozinha',  local: 'chao',   gltf: 'bar_chair_round_01', dim: [0.48, 0.75, 0.49] },
    // Banheiro
    vaso_sanitario:  { nome: 'Vaso sanitário',     cat: 'Banheiro', local: 'chao',   gera: 'vaso_sanitario', dim: [0.42, 0.82, 0.68] },
    pia_banheiro:    { nome: 'Gabinete com cuba',  cat: 'Banheiro', local: 'chao',   gera: 'pia_banheiro', dim: [0.82, 1.05, 0.48] },
    espelho_banheiro:{ nome: 'Espelho',            cat: 'Banheiro', local: 'parede', gera: 'espelho_banheiro', dim: [0.74, 0.94, 0.03], alturaCentro: 1.55 },
    box_chuveiro:    { nome: 'Box com chuveiro',   cat: 'Banheiro', local: 'chao',   gera: 'box_chuveiro', dim: [0.9, 2.05, 0.9] },
    banheira:        { nome: 'Banheira',           cat: 'Banheiro', local: 'chao',   gera: 'banheira', dim: [1.7, 0.75, 0.75] },
    // Escritório
    escrivaninha:    { nome: 'Escrivaninha',       cat: 'Escritório', local: 'chao', gltf: 'metal_office_desk', dim: [1.6, 0.79, 0.76] },
    cadeira_escritorio: { nome: 'Cadeira de escritório', cat: 'Escritório', local: 'chao', gera: 'cadeira_escritorio', dim: [0.62, 1.15, 0.62] },
    cadeira_verde:   { nome: 'Cadeira estofada',   cat: 'Escritório', local: 'chao', gltf: 'GreenChair_01', dim: [0.67, 1.06, 0.66] },
    luminaria_mesa:  { nome: 'Luminária de mesa',  cat: 'Escritório', local: 'chao', gltf: 'desk_lamp_arm_01', dim: [0.62, 0.88, 0.41] },
    notebook:        { nome: 'Notebook retrô',     cat: 'Escritório', local: 'chao', gltf: 'classic_laptop', dim: [0.33, 0.27, 0.25] },
    estante_aco:     { nome: 'Estante de aço',     cat: 'Escritório', local: 'chao', gltf: 'steel_frame_shelves_01', dim: [1.1, 2.14, 0.5] },
    estante_livros:  { nome: 'Estante de madeira', cat: 'Escritório', local: 'chao', gltf: 'wooden_bookshelf_worn', dim: [1.37, 2.06, 0.58] },
    // Iluminação
    lustre:          { nome: 'Lustre',             cat: 'Iluminação', local: 'teto', gltf: 'Chandelier_01', dim: [0.75, 0.8, 0.82] },
    pendente:        { nome: 'Pendente moderno',   cat: 'Iluminação', local: 'teto', gltf: 'modern_ceiling_lamp_01', dim: [0.43, 0.95, 0.43] },
    pendente_industrial: { nome: 'Pendente industrial', cat: 'Iluminação', local: 'teto', gltf: 'hanging_industrial_lamp', dim: [0.55, 1.36, 0.55] },
    ventilador:      { nome: 'Ventilador de teto', cat: 'Iluminação', local: 'teto', gltf: 'ceiling_fan', dim: [1.46, 0.52, 1.46] },
    luminaria_piso:  { nome: 'Luminária de piso',  cat: 'Iluminação', local: 'chao', gera: 'luminaria_piso', dim: [0.48, 1.65, 0.48] },
    // Plantas e decoração
    planta:          { nome: 'Planta grande',      cat: 'Decoração', local: 'chao',  gltf: 'potted_plant_02', dim: [0.7, 0.84, 0.66], usdz: 1 },
    suculenta:       { nome: 'Suculenta',          cat: 'Decoração', local: 'chao',  gltf: 'potted_plant_04', dim: [0.17, 0.27, 0.19], usdz: 1 },
    floreira:        { nome: 'Floreira de madeira',cat: 'Decoração', local: 'chao',  gltf: 'planter_box_01', dim: [0.91, 0.42, 0.41] },
    vaso:            { nome: 'Vaso de cerâmica',   cat: 'Decoração', local: 'chao',  gltf: 'antique_ceramic_vase_01', dim: [0.26, 0.44, 0.26], usdz: 1 },
    vaso_branco:     { nome: 'Vaso branco',        cat: 'Decoração', local: 'chao',  gltf: 'ceramic_vase_01', dim: [0.2, 0.4, 0.2] },
    vaso_alto:       { nome: 'Vaso alto',          cat: 'Decoração', local: 'chao',  gltf: 'ceramic_vase_03', dim: [0.11, 0.41, 0.11] },
    vaso_latao:      { nome: 'Vaso de latão',      cat: 'Decoração', local: 'chao',  gltf: 'brass_vase_01', dim: [0.23, 0.69, 0.23] },
    porta_retrato:   { nome: 'Porta-retrato',      cat: 'Decoração', local: 'chao',  gltf: 'standing_picture_frame_01', arte: 2, variantes: ARTES.length, dim: [0.2, 0.25, 0.1] },
    carrilhao:       { nome: 'Relógio carrilhão',  cat: 'Decoração', local: 'chao',  gltf: 'vintage_grandfather_clock_01', dim: [0.6, 2.19, 0.45] },
    busto:           { nome: 'Busto de mármore',   cat: 'Decoração', local: 'chao',  gltf: 'marble_bust_01', dim: [0.27, 0.51, 0.3], usdz: 1 },
    cavalo:          { nome: 'Estátua de cavalo',  cat: 'Decoração', local: 'chao',  gltf: 'horse_statue_01', dim: [0.16, 0.22, 0.11], usdz: 1 },
    // Parede
    quadro:          { nome: 'Quadro famoso',      cat: 'Parede',   local: 'parede', proc: 'quadro', variantes: ARTES.length, dim: [0.7, 0.6, 0.04], usdz: 1 },
    moldura_vertical:{ nome: 'Moldura clássica',   cat: 'Parede',   local: 'parede', gltf: 'hanging_picture_frame_01', arte: 5, variantes: ARTES.length, dim: [0.59, 0.84, 0.02], usdz: 1 },
    moldura_paisagem:{ nome: 'Moldura de madeira', cat: 'Parede',   local: 'parede', gltf: 'hanging_picture_frame_02', arte: 1, variantes: ARTES.length, dim: [0.75, 0.5, 0.03], usdz: 1 },
    quadro_paisagem: { nome: 'Paisagem a óleo',    cat: 'Parede',   local: 'parede', gltf: 'fancy_picture_frame_01', dim: [0.6, 0.46, 0.02] },
    espelho_classico:{ nome: 'Espelho ornamentado',cat: 'Parede',   local: 'parede', gltf: 'ornate_mirror_01', dim: [0.49, 0.74, 0.03] },
    relogio:         { nome: 'Relógio de parede',  cat: 'Parede',   local: 'parede', proc: 'relogio', variantes: 2, dim: [0.34, 0.34, 0.07], usdz: 1 },
    relogio_moderno: { nome: 'Relógio moderno',    cat: 'Parede',   local: 'parede', gltf: 'wall_clock', dim: [0.32, 0.32, 0.05] },
  };
  const PROC = window.criarMoveisProc ? window.criarMoveisProc(THREE) : {};
  for (const [id, t] of Object.entries(TIPOS)) {
    if (t.gera && !PROC[t.gera]) { delete TIPOS[id]; continue; } // moveis_proc.js não carregado nesta página
    if (t.gera) { t.variantes = PROC[t.gera].vs.length; t.nomesVar = PROC[t.gera].vs; }
  }
  const CATEGORIAS = ['Sala', 'Quarto', 'Cozinha', 'Banheiro', 'Escritório', 'Iluminação', 'Decoração', 'Parede'];
  for (const [id, t] of Object.entries(TIPOS)) { t.id = id; t.variantes = t.variantes || 1; t.foto = BASE + 'fotos/' + (t.usdz || t.proc ? id : t.gltf ? 'ph_' + t.gltf : 'gera_' + id) + '.jpg'; }

  // ---------- carregamento dos modelos reais (com cache) ----------
  const cache = {};
  const carregador = GLTFLoader ? new GLTFLoader() : null;
  function carregarGltf(pasta) {
    if (!cache[pasta]) cache[pasta] = new Promise((ok, erro) =>
      carregador.load(`${BASE}3d/${pasta}/${pasta}_1k.gltf`, g => ok(g.scene), undefined, erro));
    return cache[pasta];
  }

  // centraliza e apoia o objeto conforme o lugar (chão ou parede)
  function normalizar(obj, local) {
    obj.updateMatrixWorld(true);
    const caixa = new THREE.Box3().setFromObject(obj);
    const c = caixa.getCenter(new THREE.Vector3());
    if (local === 'parede') obj.position.sub(new THREE.Vector3(c.x, c.y, caixa.min.z));
    else if (local === 'teto') obj.position.sub(new THREE.Vector3(c.x, caixa.max.y, c.z));
    else obj.position.sub(new THREE.Vector3(c.x, caixa.min.y, c.z));
    return caixa.getSize(new THREE.Vector3());
  }

  // sombra suave de contato no chão (dá a sensação de que o móvel está "apoiado")
  let texSombra;
  function sombra(larg, prof) {
    if (!texSombra) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 128;
      const c = cv.getContext('2d'), g = c.createRadialGradient(64, 64, 8, 64, 64, 64);
      g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, 128, 128);
      texSombra = new THREE.CanvasTexture(cv);
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(larg * 1.25, prof * 1.25), new THREE.MeshBasicMaterial({ map: texSombra, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.003; m.renderOrder = -1;
    m.userData.sombra = true; m.raycast = () => {}; // não atrapalha o toque
    return m;
  }

  // ---------- quadro com obra real ----------
  const texArte = {};
  function quadro(v) {
    const a = ARTES[v % ARTES.length];
    const larg = a.r >= 1 ? 0.62 : 0.62 * a.r, alt = larg / a.r;   // tamanho da pintura
    const mat = 0.06, perfil = 0.045, prof = 0.035;                  // passe-partout e moldura
    const g = new THREE.Group();
    const corM = std(a.moldura, { roughness: 0.35, metalness: a.moldura === '#b08d3c' ? 0.6 : 0.05 });
    const W = larg + 2 * mat, H = alt + 2 * mat;
    const regua = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, prof), corM); m.position.set(x, y, prof / 2); g.add(m); };
    regua(W + 2 * perfil, perfil, 0, H / 2 + perfil / 2); regua(W + 2 * perfil, perfil, 0, -H / 2 - perfil / 2);
    regua(perfil, H, -W / 2 - perfil / 2, 0); regua(perfil, H, W / 2 + perfil / 2, 0);
    const ouro = std('#d6b56a', { metalness: 0.7, roughness: 0.3 });
    const filete = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.006), ouro); m.position.set(x, y, prof + 0.003); g.add(m); };
    const f = 0.008; filete(W + 2 * f, f, 0, H / 2 + f / 2); filete(W + 2 * f, f, 0, -H / 2 - f / 2); filete(f, H, -W / 2 - f / 2, 0); filete(f, H, W / 2 + f / 2, 0);
    const fundo = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.012), std('#f7f5ef', { roughness: 0.9 })); fundo.position.z = 0.012; g.add(fundo);
    if (!texArte[a.id]) {
      texArte[a.id] = new THREE.TextureLoader().load(`${BASE}arte/${a.id}.jpg`);
      texArte[a.id].colorSpace = THREE.SRGBColorSpace; texArte[a.id].anisotropy = 8;
    }
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(larg, alt), std('#ffffff', { map: texArte[a.id], roughness: 0.75, ...NA_FRENTE }));
    tela.position.z = 0.0185; g.add(tela);
    g.userData.legenda = `${a.titulo} · ${a.autor}`;
    return g;
  }

  // Molduras escaneadas: troca a imagem de exemplo por uma obra real e deixa o vidro transparente.
  const texArteGltf = {};
  function pintarMoldura(m, a) {
    if (!texArteGltf[a.id]) {
      const t = new THREE.TextureLoader().load(`${BASE}arte/${a.id}.jpg`);
      t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 8;  // convenção de UV do glTF
      texArteGltf[a.id] = t;
    }
    m.traverse(o => {
      if (!o.isMesh || !o.material) return;
      const nome = o.material.name || '';
      if (/_glass$/.test(nome)) {
        o.material = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.07, roughness: 0.05, metalness: 0, depthWrite: false });
      } else if (/_artwork$/.test(nome)) {
        // recorte tipo "cover": a pintura preenche a área da tela sem distorcer
        const geo = o.geometry; geo.computeBoundingBox();
        const tamTela = geo.boundingBox.getSize(new THREE.Vector3());
        const uv = geo.attributes.uv; let u0 = 1, u1 = 0, v0 = 1, v1 = 0;
        for (let i = 0; i < uv.count; i++) { const x = uv.getX(i), y = uv.getY(i); u0 = Math.min(u0, x); u1 = Math.max(u1, x); v0 = Math.min(v0, y); v1 = Math.max(v1, y); }
        const rTela = tamTela.x / tamTela.y;
        let fw = 1, fh = 1; if (a.r > rTela) fw = rTela / a.r; else fh = a.r / rTela;
        const t = texArteGltf[a.id].clone();
        t.repeat.set(fw / (u1 - u0), fh / (v1 - v0));
        t.offset.set((1 - fw) / 2 - u0 * t.repeat.x, (1 - fh) / 2 - v0 * t.repeat.y);
        const mat = o.material.clone(); mat.map = t; mat.color.set('#ffffff'); mat.needsUpdate = true;
        o.material = mat;
      }
    });
    return `${a.titulo} · ${a.autor}`;
  }

  // ---------- relógio de parede (hora certa) ----------
  function texturaCanvas(w, h, pintar) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    pintar(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  function relogio(v) {
    const g = new THREE.Group(), escuro = v % 2 === 1;
    const aro = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.045, 64), std(escuro ? '#111827' : '#8b5a2b', { roughness: 0.3, metalness: escuro ? 0.4 : 0.1 }));
    aro.rotation.x = Math.PI / 2; aro.position.z = 0.0225;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.15, 64), std('#ffffff', { map: texturaCanvas(512, 512, (c, w) => {
      c.fillStyle = escuro ? '#1f2937' : '#fffdf5'; c.fillRect(0, 0, w, w);
      c.strokeStyle = c.fillStyle = escuro ? '#f8fafc' : '#111827';
      for (let i = 0; i < 60; i++) {
        const a = i / 60 * Math.PI * 2, l = i % 5 ? 16 : 36; c.lineWidth = i % 5 ? 4 : 10; c.beginPath();
        c.moveTo(256 + Math.sin(a) * 240, 256 - Math.cos(a) * 240); c.lineTo(256 + Math.sin(a) * (240 - l), 256 - Math.cos(a) * (240 - l)); c.stroke();
      }
      c.font = '600 64px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      [12, 3, 6, 9].forEach((n, i) => { const a = i * Math.PI / 2; c.fillText(n, 256 + Math.sin(a) * 165, 256 - Math.cos(a) * 165); });
    }), roughness: 0.4, ...NA_FRENTE }));
    face.position.z = 0.048; g.add(aro, face);
    const corP = escuro ? '#f8fafc' : '#111827';
    const ponteiro = (comp, larg, cor, z) => {
      const piv = new THREE.Group(); piv.position.z = z;
      const m = new THREE.Mesh(new THREE.BoxGeometry(larg, comp, 0.004), std(cor)); m.position.y = comp / 2 - 0.015;
      piv.add(m); g.add(piv); return piv;
    };
    const ph = ponteiro(0.08, 0.012, corP, 0.053), pm = ponteiro(0.12, 0.008, corP, 0.058), ps = ponteiro(0.13, 0.003, '#dc2626', 0.063);
    const miolo = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.02, 16), std('#dc2626')); miolo.rotation.x = Math.PI / 2; miolo.position.z = 0.062; g.add(miolo);
    g.userData.atualizar = d => {
      const s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
      ps.rotation.z = -s / 60 * Math.PI * 2; pm.rotation.z = -m / 60 * Math.PI * 2; ph.rotation.z = -h / 12 * Math.PI * 2;
    };
    g.userData.atualizar(new Date(2026, 0, 1, 10, 10, 30));
    return g;
  }

  // ---------- criar um item ----------
  // Devolve um grupo na hora; o modelo real entra quando terminar de baixar (userData.pronto).
  function criar(tipo, v = 0, opcoes = {}) {
    const t = TIPOS[tipo];
    const g = new THREE.Group();
    if (t.proc || t.gera) {
      const m = t.gera ? PROC[t.gera].f(v % t.variantes) : t.proc === 'quadro' ? quadro(v) : relogio(v);
      normalizar(m, t.local); g.add(m);
      g.userData.atualizar = m.userData.atualizar; g.userData.legenda = m.userData.legenda;
      if (t.gera && t.local === 'chao' && !opcoes.semSombra && t.gera !== 'tapete') g.add(sombra(t.dim[0], t.dim[2]));
      g.userData.pronto = Promise.resolve(g);
      return g;
    }
    const [dx, dy, dz] = t.dim;
    const fantasma = new THREE.Mesh(new THREE.BoxGeometry(dx, dy, dz), new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.25, depthWrite: false }));
    fantasma.position.set(0, t.local === 'parede' ? 0 : t.local === 'teto' ? -dy / 2 : dy / 2, t.local === 'parede' ? dz / 2 : 0);
    g.add(fantasma);
    g.userData.pronto = carregarGltf(t.gltf).then(cena => {
      const m = cena.clone(true);
      if (t.girar) m.rotation.y = t.girar;
      if (t.arte != null) g.userData.legenda = pintarMoldura(m, ARTES[(t.arte + v) % ARTES.length]);
      const tam = normalizar(m, t.local);
      g.remove(fantasma); g.add(m);
      if (t.local === 'chao' && !opcoes.semSombra) g.add(sombra(tam.x, tam.z));
      return g;
    }).catch(() => { fantasma.material.color.set('#ef4444'); return g; });
    return g;
  }

  // ---------- luz de ambiente (reflexos realistas nos materiais PBR) ----------
  function ambiente(renderer) {
    const sala = new THREE.Scene();
    const caixa = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshStandardMaterial({ color: '#8a8580', side: THREE.BackSide }));
    caixa.position.y = 2; sala.add(caixa);
    const luz = (w, h, d, x, y, z, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(i, i, i * 0.95) })); m.position.set(x, y, z); sala.add(m); };
    luz(4, 0.1, 4, 0, 4.9, 0, 6);
    luz(0.1, 2, 3, -4.9, 2.5, 0, 3);
    luz(3, 2, 0.1, 0, 2.5, 4.9, 1.6);
    const pm = new THREE.PMREMGenerator(renderer);
    const tex = pm.fromScene(sala, 0.04).texture;
    pm.dispose();
    return tex;
  }

  // ---------- catálogo visual (abas + cartões com foto) ----------
  function montarCatalogo(caixa, aoEscolher, filtro = () => true) {
    caixa.innerHTML = '';
    caixa.classList.add('catalogo-visual');
    const abas = document.createElement('div'); abas.className = 'cat-abas';
    const grade = document.createElement('div'); grade.className = 'cat-grade';
    caixa.append(abas, grade);
    let atual = CATEGORIAS[0], marcado = null;
    const desenhar = () => {
      abas.querySelectorAll('button').forEach(b => b.classList.toggle('ativo', b.dataset.cat === atual));
      grade.innerHTML = '';
      for (const t of Object.values(TIPOS)) {
        if (t.cat !== atual || !filtro(t)) continue;
        const b = document.createElement('button');
        b.className = 'cat-item' + (t.id === marcado ? ' ativo' : ''); b.dataset.tipo = t.id;
        b.innerHTML = `<img src="${t.foto}" alt="" loading="lazy"><span>${t.nome}</span>`;
        b.onclick = () => aoEscolher(t.id);
        grade.appendChild(b);
      }
    };
    for (const c of CATEGORIAS) {
      if (!Object.values(TIPOS).some(t => t.cat === c && filtro(t))) continue;
      const b = document.createElement('button'); b.textContent = c; b.dataset.cat = c;
      b.onclick = () => { atual = c; desenhar(); };
      abas.appendChild(b);
    }
    desenhar();
    return { marcar(id) { marcado = id; grade.querySelectorAll('.cat-item').forEach(b => b.classList.toggle('ativo', b.dataset.tipo === id)); } };
  }

  window.Moveis = { TIPOS, CATEGORIAS, ARTES, criar, ambiente, montarCatalogo, carregarGltf };
})(window.THREE_MOVEIS || AFRAME.THREE, window.GLTFLOADER_MOVEIS || (window.AFRAME && AFRAME.THREE.GLTFLoader));
