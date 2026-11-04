# 🛋️ Decora RA: Decoração em Realidade Aumentada

Protótipo de **Realidade Aumentada** para a disciplina *Realidade Virtual e Aumentada* (Prof. Jadson de Araujo Almeida).
**App no ar:** <https://marcelooliveira23.github.io/onde-estou-ra/> (abra no **Safari do iPhone**)

**Utilidade:** ver **móveis, plantas e quadros de verdade, em tamanho real**, dentro da própria casa **antes de comprar**:
se o sofá cabe, se a planta combina, em que altura fica o quadro. Evita compras erradas e devoluções.

## Os 4 modos

| Modo | Como funciona | Precisa de placa? |
|---|---|---|
| **🪄 Decorar o ambiente** (`livre.html`) | **SLAM visual** no navegador (AlvaAR/WebAssembly): reconhece o **chão** e as **paredes** pela câmera. Toque no lugar e o objeto aparece ali, em tamanho real. Arraste, gire, aumente/diminua, troque a obra do quadro | **Não** |
| **🗺️ Mapear a casa** (`mapear.html`) | Volta de 360° no meio de cada cômodo mirando os **cantos do chão**, **portas**, **janelas** e **passagens**. Mede pela **inclinação do celular** (d = h ÷ tan θ) e desenha a **planta ao vivo** no canto da tela. Passou pela porta, o próximo cômodo é **emendado** na planta. No fim: **planta 2D com medidas e m²**, **maquete 3D** e imagem para compartilhar | **Não** |
| **📍 Com placa na parede** (`index.html`) | **Rastreamento de imagem** (MindAR): a placa vira a âncora. Localizador da casa (mapa 3D no canto, rota até o cômodo, como no exemplo do professor) + **decoração presa à parede**, salva no celular | Sim |
| **📱 AR nativo do iPhone** | **AR Quick Look** do iOS (ARKit) com arquivos `.usdz` gerados dos mesmos modelos | Não |

## Catálogo (objetos reais)

- **17 itens**: sofá, poltronas, puff, mesas, estante, cômoda, plantas, vaso de cerâmica, busto de mármore, estátua, molduras, quadro e relógio.
- **Móveis e objetos:** modelos **escaneados por fotogrametria** de objetos reais (**Poly Haven**, licença **CC0**), com texturas PBR (couro, madeira, mármore).
- **Quadros:** fotos de **obras de arte reais em domínio público** (Wikimedia Commons): *A Noite Estrelada*, *A Grande Onda de Kanagawa*, *Impressão, Nascer do Sol*, *O Quarto em Arles*, *O Beijo*, *Moça com Brinco de Pérola*, *Nenúfares* e *Os Girassóis*. O botão 🎨 troca a obra.
- **Iluminação realista:** mapa de ambiente (reflexos) + **sombra de contato** sob os móveis.
- **📸 Foto do ambiente decorado:** junta a câmera e os objetos 3D numa foto e abre o compartilhar do iPhone (WhatsApp, Fotos…).
- **⚡ Modo rápido (rede de segurança):** se o SLAM não achar o chão em 12 s (pouca luz, chão liso) ou não carregar no aparelho, o app passa a usar só o **giroscópio**: chão virtual a 1,3 m, e **＋ superfície** cria uma parede a 2 m. Funciona sempre.
- **🧠 Como funciona** (`explicacao.html`): página com o diagrama do processo, para mostrar no vídeo.

## Como usar no iPhone (modo sem placa)

1. Abra o link no **Safari** → **🪄 Decorar o ambiente** → **📷 Começar** → permita **câmera** e **movimento**.
2. Aponte para o **chão** e mova o celular **devagar para os lados** (pontinhos verdes = o app está mapeando).
3. Apareceu **"✅ Chão encontrado!"** → escolha um item no catálogo → **toque no chão** onde ele deve ficar.
4. Toque no objeto para **arrastar**, **↻ girar**, **− / +** (ou pinça) e **🎨 arte** (nos quadros).
5. Para a **parede**: toque em **＋ superfície** e aponte para a parede, mexendo devagar. Depois escolha um quadro e toque na parede.
6. Se o app confundir chão com parede: **↕️ É chão / é parede**. Se perder o lugar: volte devagar ou toque em 🔄.
7. Não achou o chão em 12 s? Toque em **⚡ Usar o modo rápido**.
8. Toque em **📸** para tirar a foto e compartilhar.

## Como usar no iPhone (mapear a casa)

1. **🗺️ Mapear a casa** → ajuste a **altura do celular** (peito; pessoa de 1,70 m ≈ 1,40 m) → **📷 Começar** → permita câmera e movimento.
2. Escolha o cômodo (**Sala**, **Cozinha**…). Fique em pé **no meio** dele.
3. Gire devagar. A cada **canto do chão** (onde duas paredes se encontram), ponha a **mira** e toque **📍 Canto**. A planta aparece no canto da tela.
4. Viu uma porta, janela ou passagem? Mire a **base** dela no chão e toque **🚪 / 🪟 / ↔️**. Errou? **↩️ Voltar**.
5. Volta completa (anel em 100%) → **✅ Concluir**: o app esquadreja as paredes, encaixa portas e janelas e pode sugerir janelas pela **claridade** 💡.
6. Toque em **➡️ Porta 1 · Sala**, passe pela porta, escolha o novo cômodo, pare no meio, **mire a soleira da porta por onde entrou** e toque **🚪 Entrei por esta porta**. Repita o passo 3.
7. **📐 Altura do teto** (opcional, depois do ✅): levante o celular, mire a linha onde a parede encontra o teto e toque **📐 Medir aqui** (altura = h + distância da parede × tan α).
8. **🗺️** abre a planta: **2D com medidas**, **🧊 maquete 3D** (gire com o dedo), **🧮 Materiais** (piso, rodapé, tinta) e **📤 Compartilhar** (imagem PNG). A planta fica salva no celular.
9. **📏 Calibrar:** na planta 2D, **toque numa parede** e digite a medida da trena. A casa inteira é corrigida na mesma proporção (e a altura do celular também).

> **Precisão:** depende da altura informada e de mirar bem o canto. Erro típico de 5 a 10 cm por metro, que some ao calibrar com a trena (passo 9). A mira usa a **média dos últimos 0,35 s** para tirar a tremida da mão.

> **Sobre a escala:** sem placa, a câmera sozinha não sabe medidas absolutas. O app supõe o celular a ~1,3 m do chão (pessoa em pé).
> Se o objeto parecer grande ou pequeno demais, ajuste com − / +. No modo **com placa** a escala é exata (a placa tem 17 cm).

## Por que não Unity?

A atividade diz "**no Unity ou em outro software**", então o Unity é opcional. Para rodar um app Unity **no iPhone** é obrigatório compilar no **Mac com Xcode**, e este projeto foi feito no Windows. Por isso o protótipo usa **WebAR** (A-Frame + three.js + MindAR), que roda **direto no Safari do iPhone**, por HTTPS. É RA de verdade, com a câmera reconhecendo imagens, como o Vuforia faria no Unity.

---

# 🚀 Passo a passo: GitHub Pages → iPhone

### Passo 1: criar a conta no GitHub (se ainda não tiver)
1. Entre em <https://github.com/signup>, cadastre e-mail e senha e escolha um **nome de usuário** (ex.: `marcelooliveira23`).
2. Confirme o código que chega no e-mail.

### Passo 2: criar o repositório
1. Logado, clique no **+** (canto superior direito) → **New repository**.
2. **Repository name:** `onde-estou-ra`
3. Marque **Public**. O GitHub Pages grátis exige repositório público.
4. Clique em **Create repository**.

### Passo 3: enviar os arquivos
1. Na página do repositório recém-criado, clique no link **"uploading an existing file"**.
2. No Windows Explorer, abra a pasta **`LocalizadorCasaRA`**, selecione **tudo o que está dentro dela** (Ctrl+A) e **arraste** para a página do GitHub.
   - Arraste **o conteúdo** da pasta, não a pasta em si. O `index.html` precisa ficar na raiz do repositório.
   - Confira se as pastas `css`, `js`, `lib`, `marcadores`, `modelos` e `icones` e o arquivo `targets.mind` aparecem na lista.
   - O arquivo `.nojekyll` é oculto e não é obrigatório, o site funciona sem ele.
3. Espere terminar o envio e clique em **Commit changes**.

### Passo 4: ligar o GitHub Pages
1. No repositório, clique em **Settings** (aba de cima) → **Pages** (menu da esquerda).
2. Em **Build and deployment → Source**, escolha **Deploy from a branch**.
3. Em **Branch**, escolha **main** e **/(root)** e clique em **Save**.
4. Espere 1–2 minutos e recarregue a página. Aparece: **"Your site is live at `https://SEU-USUARIO.github.io/onde-estou-ra/`"**.
5. Para acompanhar, a aba **Actions** mostra o deploy (bolinha verde = pronto).

### Passo 5: imprimir as placas
1. No **PC**, abra `https://SEU-USUARIO.github.io/onde-estou-ra/marcadores.html`.
2. Clique em **Imprimir**. Sai 1 placa por folha A4, com QR code.
3. Cole a **SALA** na parede **norte** da sala e a **COZINHA** na parede **leste** da cozinha, na altura dos olhos.
   - Se na sua casa forem outras paredes, mude o campo `parede` em `config.js` (veja abaixo).
   - Sem impressora: toque na placa para abrir em tela cheia num monitor ou tablet.

### Passo 6: abrir no iPhone 18 Pro Max
1. Abra o **Safari** (precisa ser o Safari) e digite `https://SEU-USUARIO.github.io/onde-estou-ra/`
   (ou aponte a **câmera comum** do iPhone para o QR code da folha impressa).
2. Toque em **📷 Iniciar câmera** → **Permitir**.
3. Aponte para a placa a **40–80 cm**, com boa luz. Em 1–2 s aparece a maquete 3D e o minimapa no canto.
4. **Recomendado:** toque em **Compartilhar (⬆️) → Adicionar à Tela de Início**. Vira um ícone "Onde Estou?", que abre como app em tela cheia (fica melhor no vídeo).

**Se a câmera não abrir:** Ajustes → Apps → Safari → **Câmera → Permitir**, e recarregue. Confira se o endereço começa com `https://`.
**Se a placa não for reconhecida:** acenda a luz, evite reflexo (papel fosco) e mostre a placa inteira na tela.

### Passo 7: gravar e entregar
1. Ajustes → **Central de Controle** → adicione **Gravação de Tela**.
2. Abra a Central de Controle, **segure** o botão de gravação → **Microfone: Ativado** → **Iniciar Gravação**.
3. Narre seguindo o `ROTEIRO_VIDEO.md`. **Sem música.**
4. YouTube → **Criar → Enviar vídeo** → visibilidade **Não listado** → copie o link → cole no **AVA Univirtus**.

### Para atualizar depois
No GitHub, abra o arquivo (ex.: `config.js`) → ícone ✏️ → edite → **Commit changes**. Em 1 minuto o site é atualizado. No iPhone, recarregue a página duas vezes.

---

## 🛋️ Usar o modo Decorar no iPhone

1. Aponte para a placa e toque em **🛋️** (ao lado do 🔊). A maquete some e aparece a barra de decoração.
2. Toque em **🖼️ Quadro** e depois **na parede**, onde quer o quadro. **Afaste-se 1 a 2 m** para vê-lo inteiro: ele tem o tamanho real, 62 × 47 cm.
3. Toque no objeto e **arraste** para mudar o lugar. Use **− / +** ou a **pinça** para o tamanho, **🎨 trocar** para outra arte ou cor e **🗑️** para remover.
4. **🪴 Vaso (chão):** toque na parede **acima** do lugar desejado e ele vai para o chão logo abaixo. Arraste para aproximar ou afastar da parede.
5. **📌 Marcar:** escreve um lembrete preso à parede (ex.: "Tomada", "Furar aqui").
6. **✔ Concluir** volta ao localizador. A decoração fica salva para aquela parede.

**Sem placa, em qualquer canto:** toque em **📱 AR do iPhone** e escolha o objeto. O iOS abre a RA nativa: mexa o celular até ele achar o chão ou a parede, toque para colocar e arraste com o dedo. Ao fechar, toque em **📷 Voltar para a câmera**.

> Se a placa "se perder" quando você se afasta, chegue um pouco mais perto ou imprima a placa maior (e ajuste `larguraPlaca` no `config.js`).

## Ver e ensaiar no PC (sem iPhone)

Dê dois cliques em **`ABRIR_SIMULADOR.bat`**. Abre o navegador com o **simulador**: um iPhone na tela, botões "apontar para a placa", uma **▶ Demonstração automática** e a **🛋️ Demonstração: decorar a parede**.
No mesmo endereço, `http://localhost:8080/index.html` usa a **webcam** do PC de verdade: mostre a placa na tela do celular para a webcam.

## Adaptar para a SUA casa (`config.js`)

| Campo | O que é |
|---|---|
| `x, y, w, h` | posição e tamanho do cômodo na planta, em metros (x → leste, y → sul) |
| `parede` | onde a placa foi colada: `'N'`, `'S'`, `'L'` ou `'O'`. **É isso que alinha a maquete e a seta com a casa real.** |
| `info` | texto que aparece no painel |
| `saida` / `porta` | marca o cômodo da saída e o ponto da porta da rua (botão 🚨) |
| `portas` | passagens entre cômodos (ponto sobre a parede comum) |
| `larguraPlaca` | largura da imagem impressa, em metros (padrão 0,17 = 17 cm). É o que deixa a decoração em **tamanho real** |
| `alturaPlaca` | altura do centro da placa até o chão, em metros (padrão 1,5). Serve para pôr o vaso **no chão** |

## Como funciona (para explicar no vídeo)

| Parte | Arquivo | Tecnologia |
|---|---|---|
| Reconhecimento das placas | `targets.mind` | **MindAR**: extrai pontos característicos das imagens e os procura em cada quadro da câmera |
| Maquete 3D sobre a placa | `js/maquete.js` | **A-Frame / three.js** |
| Minimapa 3D estilo game | `js/minimapa3d.js` | segunda cena three.js, câmera em 3ª pessoa |
| Planta, rotas e direção | `js/casa.js` | busca em largura pelas portas; **produto escalar** com os vetores "direita" e "frente" de quem olha a placa |
| Interface, voz, chegada | `js/app.js` | HTML/SVG, `speechSynthesis` |
| Mapear a casa | `mapear.html`, `js/mapear.js` | **giroscópio** + **trigonometria** (d = h ÷ tan θ); esquadrejamento por retas; emenda dos cômodos pela porta em comum (rotação + translação); claridade para sugerir janelas; pé-direito (h + s·tan α); calibração por escala; lista de materiais; planta em Canvas 2D e maquete em three.js |
| Decorar sem placa | `livre.html`, `js/livre.js` | **SLAM** (AlvaAR): pose da câmera a cada quadro + ajuste de plano; o toque vira um raio que cruza o plano |
| Modo Decorar (placa) | `js/decor.js`, `js/moveis.js` | o toque vira um **raio** (Raycaster) que cruza o **plano da parede** definido pela placa; objetos 3D feitos em código, em metros |
| AR nativo do iPhone | `modelos/*.usdz` | **AR Quick Look** do iOS (ARKit detecta chão e paredes), arquivos USDZ gerados dos mesmos modelos |
| App instalável/offline | `manifest.webmanifest`, `sw.js` | PWA |

## Créditos e licenças
- **Modelos 3D:** [Poly Haven](https://polyhaven.com) (CC0, domínio público).
- **Obras de arte:** fotos em domínio público do [Wikimedia Commons](https://commons.wikimedia.org).
- **Bibliotecas:** MindAR, A-Frame, three.js e qrcode-generator (MIT); **AlvaAR** (SLAM, **GPL-3.0**; veja `lib/LICENSE-AlvaAR-GPL3.txt`).
- Feito para este projeto: a interface, o modo decorar (posicionamento por raio, planos, escala), o mapeamento da casa (medição por inclinação, esquadrejamento, emenda dos cômodos, planta e maquete), o localizador (maquete, minimapa, rotas), as placas, o quadro e o relógio 3D.
