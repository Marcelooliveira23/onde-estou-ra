# 🎬 Roteiro do vídeo (3 a 4 minutos, sem música)

Grave com a **Gravação de Tela do iPhone com o microfone ligado** e fale com as **suas palavras**. Os textos abaixo são só um guia.
Peso na nota: **projeto funcionando 40%**, **utilidade 30%**, **explicação 30%**.
Dica: abra o app pelo **ícone na Tela de Início** (fica em tela cheia) e grave numa sala **bem iluminada**.

---

### 1. Apresentação (0:00–0:20): tela inicial
> "Olá, meu nome é ______. Este é o meu protótipo de Realidade Aumentada: o **Decora RA**, um app para **decorar a casa** com móveis e quadros virtuais em **tamanho real**."

### 2. Utilidade (0:20–0:50)
> "Quem vai comprar um sofá ou um quadro sempre fica na dúvida: será que cabe? Será que combina? Com o app eu **vejo o objeto dentro da minha sala antes de comprar**. Os móveis são **modelos 3D escaneados de objetos reais**, e os quadros são **obras famosas** em domínio público."

### 3. RA sem placa: reconhecendo o ambiente (0:50–1:50), parte principal
Toque em **🪄 Decorar o ambiente** → **Começar**. Aponte para o chão e mexa devagar.
> "O app não precisa de placa nem de QR code: ele usa **SLAM**, que reconhece o ambiente pela câmera. Esses pontinhos verdes são pontos do chão que ele está acompanhando… pronto: **chão encontrado**."

Escolha **Poltrona** e toque no chão. Ande em volta.
> "Escolho uma poltrona e toco no chão: ela fica **parada no lugar**, mesmo quando eu ando em volta. Posso **arrastar**, **girar** e mudar o tamanho."

Coloque uma **Planta grande** e a **Mesa lateral**.

### 4. Quadro na parede (1:50–2:30)
Toque em **＋ superfície**, aponte para a parede e mexa devagar. Escolha **Parede → Quadro famoso** e toque na parede. Toque em **🎨 arte**.
> "Agora a parede: o app encontrou a parede, e eu penduro um quadro. No 🎨 eu troco a obra: Van Gogh, Hokusai, Monet…"

### 5. Outros modos (2:30–2:55), opcional
> "Também tem o modo **com placa**, em que uma imagem na parede serve de âncora e deixa a escala exata, com um localizador da casa. E o botão **AR do iPhone** abre os mesmos objetos na RA nativa do iOS."

### 6. Como foi feito (2:55–3:40)
> "O professor permitiu Unity ou outro software. Como eu queria rodar no iPhone, e o Unity exige um Mac para gerar o app de iOS, fiz em **WebAR**: o app roda direto no **Safari**, hospedado no **GitHub Pages**. Usei:
> - **AlvaAR**, uma biblioteca de **SLAM** em WebAssembly: a cada quadro da câmera ela calcula a **posição do celular** e encontra **planos** como o chão e a parede;
> - **three.js**, para desenhar os modelos 3D com **iluminação realista**;
> - modelos **escaneados por fotogrametria** (Poly Haven) e obras de arte em **domínio público**.
>
> Para colocar o objeto, o toque na tela vira um **raio** que sai da câmera, e o ponto onde ele cruza o plano do chão ou da parede é onde o objeto fica."

### 7. Encerramento (3:40–4:00)
> "Com isso dá para planejar a decoração inteira antes de gastar. Obrigado!"

---

### ✅ Checklist antes de enviar
- [ ] Gravado **na tela do iPhone**, com o app rodando de verdade (não o simulador)
- [ ] **Sua voz** explicando, **sem música**
- [ ] Mostrou: reconhecer o chão → colocar móvel → andar em volta → parede → quadro → trocar a obra
- [ ] Explicou a **utilidade** e **como foi feito**
- [ ] YouTube **Não listado** → link no **AVA Univirtus**
