# 🎬 Roteiro do vídeo (3 a 4 minutos, sem música)

Grave com a **Gravação de Tela do iPhone com o microfone ligado** e fale com as **suas palavras**. Os textos abaixo são só um guia.
Peso na nota: **projeto funcionando 40%**, **utilidade 30%**, **explicação 30%**.
Dica: abra o app pelo **ícone na Tela de Início** (fica em tela cheia) e grave numa sala **bem iluminada**.

### 🛟 Plano B (para o vídeo nunca ficar sem RA funcionando)
1. **Ensaie antes** no mesmo cômodo. O SLAM gosta de chão **com textura** (tapete, piso de madeira, objetos no chão). Chão liso e branco é difícil.
2. Se em 12 s ele não achar o chão, aparece **⚡ Usar o modo rápido** (giroscópio): toque e continue o roteiro normalmente.
   Fale: *"aqui a luz está fraca, então o app passou para o modo rápido, que usa o giroscópio"*. Mostrar que o app se adapta também conta ponto.
3. Último recurso: **📱 AR nativo do iPhone** (Quick Look), que sempre funciona.

---

### 1. Apresentação (0:00–0:15): tela inicial
> "Olá, meu nome é ______. Este é o meu protótipo de Realidade Aumentada: o **Decora RA**, um app para **decorar a casa** com móveis e quadros virtuais em **tamanho real**."

### 2. Utilidade (0:15–0:35)
> "Quem vai comprar um sofá ou um quadro sempre fica na dúvida: será que cabe? Será que combina? Com o app eu **vejo o objeto dentro da minha sala antes de comprar**. Os móveis são **modelos 3D escaneados de objetos reais**, e os quadros são **obras famosas** em domínio público."

### 3. RA sem placa: reconhecendo o ambiente (0:35–1:25), parte principal
Toque em **🪄 Decorar o ambiente** → **Começar**. Aponte para o chão e mexa devagar.
> "O app não precisa de placa nem de QR code: ele usa **SLAM**, que reconhece o ambiente pela câmera. Esses pontinhos verdes são pontos do chão que ele está acompanhando… pronto: **chão encontrado**."

Escolha **Poltrona** e toque no chão. Ande em volta.
> "Escolho uma poltrona e toco no chão: ela fica **parada no lugar**, mesmo quando eu ando em volta. Posso **arrastar**, **girar** e mudar o tamanho."

Coloque uma **Planta grande** e a **Mesa lateral**. Toque em **↻ girar** na poltrona.

### 4. Quadro na parede (1:25–1:55)
Toque em **＋ superfície**, aponte para a parede e mexa devagar. Escolha **Parede → Quadro famoso** e toque na parede. Toque em **🎨 arte**.
> "Agora a parede: o app encontrou a parede, e eu penduro um quadro. No 🎨 eu troco a obra: Van Gogh, Hokusai, Monet…"

### 4b. Foto para compartilhar (1:55–2:05)
Toque em **📸**.
> "Com um toque eu tiro uma **foto do ambiente decorado** e mando para a família pelo WhatsApp, antes de comprar."

### 4c. Mapear a casa (2:05–3:05): o "uau" do vídeo
Volte ao início → **🗺️ Mapear a casa** → **Começar** → **Sala**. Fique no meio do cômodo.
> "Agora o app vai **montar a planta da minha casa**. Eu só fico no meio do cômodo e dou uma volta de 360°."

Gire devagar. Toque no selo roxo **🤖** para mostrar **o que a IA vê** (parede amarela, chão verde). Mostre os pontos roxos aparecendo na planta. No fim da volta ela **fecha a planta sozinha**.
> "Uma **inteligência artificial roda aqui no celular** e pinta cada pixel: parede, chão, porta, janela. Onde a parede encontra o chão, o app calcula a distância pela **inclinação do celular**: altura ÷ tangente do ângulo. Eu não toquei em nada, e a sala tem tantos metros quadrados."

*(Se a IA errar num cômodo cheio de móveis: 🔄 e marque os 4 cantos com 📍, que funciona sempre.)*

Toque **➡️ Porta**, vá para o próximo cômodo, **mire a porta por onde entrou** → marque os cantos → **✅**.
> "Quando eu passo pela porta, o app **emenda** o próximo cômodo na planta, porque a porta é o mesmo ponto nos dois cômodos."

Toque **📐 Altura do teto**, levante o celular para a linha do teto → **📐 Medir aqui**.
> "Olhando para cima ele mede o **pé-direito**: altura do celular mais a distância da parede vezes a tangente do ângulo."

Toque **🗺️** → toque numa parede da planta e digite a medida da **trena**. Depois **🧊 Maquete** (gire com o dedo) e **🧮 Materiais**.
> "Se eu medir **uma** parede com a trena, o app corrige a casa inteira. No fim eu tenho a **planta com as medidas**, uma **maquete 3D** e a **lista do que comprar**: piso, rodapé e quantos galões de tinta. Dá para mandar tudo para o arquiteto ou o pedreiro."

### 4d. Realidade Virtual: mobiliar a casa medida (+40 s)
Na planta, toque **🥽 Mobiliar em VR**. Ponha um **sofá**, uma **mesa** e uma **planta** tocando no chão; em **🎨 Pintar**, troque a cor da parede e o piso.
> "A planta que eu medi vira uma **casa em realidade virtual**. Eu mobilio e pinto antes de comprar."

Toque **🚶 Passear** e ande pela casa com o joystick, passando pela porta. Toque **🌙** para ver de noite. Mostre **👓 Óculos VR** por 3 segundos.
> "E eu posso **andar por dentro** dela, até com óculos de realidade virtual. Então o projeto tem as duas coisas da disciplina: **realidade aumentada**, em cima da câmera, e **realidade virtual**, dentro da casa."

### 5. Outros modos (opcional, uma frase)
> "Também tem o modo **com placa**, em que uma imagem na parede serve de âncora e deixa a escala exata, com um localizador da casa. E o botão **AR do iPhone** abre os mesmos objetos na RA nativa do iOS."

### 6. Como foi feito (3:05–3:45)
Abra **🧠 Como funciona** (link na tela inicial) e vá descendo pelo diagrama enquanto fala.
> "O professor permitiu Unity ou outro software. Como eu queria rodar no iPhone, e o Unity exige um Mac para gerar o app de iOS, fiz em **WebAR**: o app roda direto no **Safari**, hospedado no **GitHub Pages**. Usei:
> - **AlvaAR**, uma biblioteca de **SLAM** em WebAssembly: a cada quadro da câmera ela calcula a **posição do celular** e encontra **planos** como o chão e a parede;
> - **three.js**, para desenhar os modelos 3D com **iluminação realista**;
> - o **giroscópio** e trigonometria para medir a casa e desenhar a planta;
> - modelos **escaneados por fotogrametria** (Poly Haven) e obras de arte em **domínio público**.
>
> Para colocar o objeto, o toque na tela vira um **raio** que sai da câmera, e o ponto onde ele cruza o plano do chão ou da parede é onde o objeto fica."

### 7. Encerramento (3:45–4:00)
> "Com isso dá para planejar a decoração inteira antes de gastar. Obrigado!"

---

### ✅ Checklist antes de enviar
- [ ] Gravado **na tela do iPhone**, com o app rodando de verdade (não o simulador)
- [ ] **Sua voz** explicando, **sem música**
- [ ] Mostrou: reconhecer o chão → colocar móvel → andar em volta → parede → quadro → trocar a obra → 📸 foto
- [ ] Mostrou: 🗺️ mapear 2 cômodos (🤖 IA) → planta ao vivo → emenda pela porta → 📐 teto → 📏 trena → maquete 3D → 🧮 materiais
- [ ] Mostrou: 🥽 VR → mobiliar → pintar → passear → óculos
- [ ] Vídeo passou de ~5 min? Corte a parte 5 e encurte a 4b
- [ ] Explicou a **utilidade** e **como foi feito**
- [ ] YouTube **Não listado** → link no **AVA Univirtus**
