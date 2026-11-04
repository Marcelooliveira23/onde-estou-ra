# 🎬 Roteiro do vídeo (3 a 4 minutos e meio, sem música)

Grave com a **Gravação de Tela do iPhone com o microfone ligado** e fale com as **suas palavras**. Os textos abaixo são só um guia.
Peso na nota: **projeto funcionando 40%**, **utilidade 30%**, **explicação 30%**.

Dica: abra o app pelo **ícone na Tela de Início** (Adicionar à Tela de Início), assim fica em tela cheia.

---

### 1. Apresentação (0:00–0:20): tela inicial do app
> "Olá, meu nome é ______. Este é o meu protótipo de Realidade Aumentada para a disciplina de Realidade Virtual e Aumentada. Ele se chama **Onde Estou?**: um **localizador dentro de um prédio**, a ideia sugerida na atividade, simulado aqui na minha casa."

### 2. Utilidade (0:20–0:50)
> "O GPS do celular mostra em que endereço eu estou, mas **não diz em qual sala ou em qual andar** de um prédio. Em hospitais, escolas e shoppings as pessoas se perdem. A solução: uma **placa com uma imagem** na parede de cada ambiente. Aponto o celular, o app **reconhece a imagem**, **carrega no canto da tela um mapa com a minha localização** e mostra o caminho até onde eu quero ir."

### 3. RA funcionando na SALA (0:50–1:50): parte principal
Toque em **Iniciar câmera** e aponte para a placa da **SALA**.
> "Aponto a câmera para a placa da sala. O app reconheceu a imagem e apareceu em cima dela uma **maquete 3D da casa**, com o pino **'você está aqui'**. E no **canto da tela** carregou o **mapa 3D, como num jogo**: esse bonequinho sou eu, e o cone amarelo mostra para onde estou olhando."

Toque em **2D** e depois em **3D** no mapa:
> "Também dá para ver a planta em 2D."

Toque em **Cozinha**:
> "Escolho ir para a cozinha. Aparecem a **trilha verde** e a **seta 3D**, e a instrução: **vá para a sua direita, uns 5 metros**. A maquete está **girada igual à casa real**: a cozinha aparece à direita porque está mesmo à minha direita."

Toque em **Banheiro**:
> "Para o banheiro, a rota é recalculada passando pela cozinha: uns 8 metros."

Toque em 🔊 (voz) e depois afaste a câmera da placa:
> "Tem voz, para acessibilidade. E se eu tiro a câmera da placa, o app **lembra a última posição**."

### 4. Andar até a COZINHA (1:50–2:30)
Com destino **Cozinha**, ande até lá e aponte para a placa **COZINHA**.
> "Seguindo a seta, cheguei na cozinha. Apontei para a placa e o app confirmou: **'Você chegou à Cozinha'**, com o tempo do percurso. O mapa agora mostra que estou na cozinha."

Toque em **🚨 Saída**:
> "Numa emergência, um toque mostra a **rota de fuga** até a porta de saída, em vermelho."

### 4b. Bônus: decorar a parede (2:30–2:55), opcional
Volte para a placa da **SALA**, toque em **🛋️**, depois em **Quadro** e **toque na parede**. Afaste-se um pouco.
> "O app também simula **decoração**: escolho um quadro e toco na parede, e ele aparece em **tamanho real**, preso à parede. Arrasto para mudar o lugar e posso pôr um **vaso no chão**. Para pôr em qualquer canto, sem placa, o botão **AR do iPhone** usa a RA nativa do iOS."

*(Se o vídeo ficar longo, corte esta parte. O foco da nota é o **localizador**.)*

### 5. Como foi feito (2:55–3:45)
> "O professor permitiu Unity ou outro software. Como eu queria rodar no iPhone e o Unity exige um Mac para gerar o app de iOS, fiz em **WebAR**: o app roda direto no **Safari**, hospedado no **GitHub Pages**. Usei:
> - **MindAR**, para reconhecer as imagens das placas. Ele procura pontos característicos da imagem em cada quadro da câmera;
> - **A-Frame e three.js**, para a maquete 3D, o minimapa 3D, a seta e a trilha animada;
> - um arquivo com a **planta da casa**: cômodos, portas e a parede onde está cada placa.
>
> Na decoração, o toque na tela vira um **raio** que sai da câmera, e o ponto onde ele cruza o **plano da parede** (definido pela placa) é onde o objeto fica.
> A rota é uma **busca pelas portas** entre os cômodos. Para dizer 'direita', 'esquerda' ou 'atrás', faço um **produto escalar** entre a direção do caminho e os vetores 'direita' e 'frente' de quem está olhando a placa."

### 6. Encerramento (3:45–4:00)
> "Num prédio real, bastaria cadastrar a planta e imprimir uma placa por ambiente. Obrigado!"

---

### ✅ Checklist antes de enviar
- [ ] Gravado **na tela do iPhone**, com o app rodando de verdade (não o simulador)
- [ ] **Sua voz** explicando, **sem música**
- [ ] Mostrou: reconhecer a placa → **mapa no canto** → maquete 3D → troca de destino → andar até a outra placa → "você chegou"
- [ ] Explicou a **utilidade** e **como foi feito**
- [ ] YouTube **Não listado** → link no **AVA Univirtus**
