# 📍 Onde Estou? Localizador da Casa em Realidade Aumentada

Protótipo de **Realidade Aumentada** para a disciplina *Realidade Virtual e Aumentada* (Prof. Jadson de Araujo Almeida).
Ele implementa **o exemplo dado pelo próprio professor** na atividade:

> *"ao apontar para uma imagem com o celular, carrega no canto da tela um mapa informando sua localização em um prédio (similar a um jogo 3D) […] chegando na sua sala e olhando uma imagem na parede que carrega o mapa"*

## O que o app faz

| Pedido do professor | No app |
|---|---|
| "apontar para uma imagem com o celular" | Placa colada na parede do cômodo, reconhecida pela câmera (MindAR, rastreamento de imagem) |
| "carrega no canto da tela um mapa" | **Minimapa no canto superior direito**, que abre quando a placa é reconhecida |
| "informando sua localização" | Boneco do jogador / ponto **"VOCÊ ESTÁ AQUI"** + painel "Você está na Sala" |
| "similar a um jogo 3D" | Minimapa **3D em terceira pessoa**, como em game (boneco com cone de visão), e **maquete 3D da casa** sobre a placa. O botão 2D/3D troca para a planta |
| "simular com um mapa da sua casa" | Planta da casa configurável em `config.js` |

**Extras que aumentam a utilidade:**
- **Rota até o cômodo escolhido**, com trilha animada e seta 3D, mais a instrução calculada: "vá para a sua direita", "vire-se: o caminho é atrás de você" e a distância.
- **Chegada detectada:** ao apontar para a placa do destino, aparece "✅ Você chegou à Cozinha! Percurso concluído em 12 s".
- **🚨 Rota de emergência:** um toque leva até a porta da rua (rota de fuga em vermelho).
- **🔊 Voz** que lê a instrução (acessibilidade).
- **Lembra a última posição** quando a placa sai da câmera.
- **App instalável:** "Adicionar à Tela de Início" no iPhone abre como app, em tela cheia, e funciona offline depois da 1ª visita.
- **QR code** nas folhas impressas: a câmera comum do iPhone abre o app direto.
- **🛋️ Modo Decorar:** com a placa na câmera, escolha **Quadro, Relógio, Prateleira, Vaso** ou **📌 Marcar** e toque na parede. O objeto aparece **em tamanho real**, preso à parede. Dá para arrastar, aumentar e diminuir (botões ou pinça), trocar o modelo e remover. Tudo fica salvo e reaparece quando você volta à placa.
- **📱 AR nativo do iPhone (AR Quick Look):** abre os mesmos objetos na RA do próprio iOS, que encontra **chão e paredes sozinha, sem placa**. Assim dá para pôr o vaso em qualquer canto.
- **Simulador** para ver e ensaiar no PC sem câmera (`simulador.html`).

**Utilidade:** o GPS mostra **em que endereço** você está, mas não **em qual sala, corredor ou andar** de um prédio. A placa na parede resolve isso com precisão de cômodo. Isso serve para hospitais, escolas, shoppings, museus e para a evacuação em emergências.

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
| Modo Decorar | `js/decor.js`, `js/moveis.js` | o toque vira um **raio** (Raycaster) que cruza o **plano da parede** definido pela placa; objetos 3D feitos em código, em metros |
| AR nativo do iPhone | `modelos/*.usdz` | **AR Quick Look** do iOS (ARKit detecta chão e paredes), arquivos USDZ gerados dos mesmos modelos |
| App instalável/offline | `manifest.webmanifest`, `sw.js` | PWA |

## Créditos
Bibliotecas de código aberto (licença MIT): **MindAR**, **A-Frame**, **three.js** e **qrcode-generator**.
A maquete, as placas, os mapas e a lógica de rota foram feitos para este projeto, sem modelos 3D de terceiros.
