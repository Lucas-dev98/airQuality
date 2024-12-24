# Condições Climáticas Atuais 🌤️

Este é um projeto web que permite aos usuários verificar as condições climáticas atuais para qualquer localização fornecida. Ao inserir o nome de uma cidade ou endereço, o aplicativo usa a API OpenCage para converter o local em coordenadas geográficas e a API Azure Maps para exibir dados climáticos detalhados, incluindo temperatura, sensação térmica, umidade, vento e índice UV. O fundo animado do site apresenta um GIF de um globo giratório, proporcionando uma experiência visual envolvente.

## Funcionalidades

- **Busca de clima atual**: Insira coordenadas ou um endereço para obter informações climáticas em tempo real.
- **Conversão de endereço**: Use a API OpenCage para converter nomes de locais em coordenadas de latitude e longitude.
- **Dados climáticos detalhados**: Exibe temperatura, sensação térmica, umidade, velocidade do vento, direção do vento e índice UV.
- **Animação de fundo**: Um GIF de globo giratório é usado como plano de fundo para uma experiência mais imersiva.

## Tecnologias Utilizadas

- **HTML5**: Estrutura da página web.
- **CSS3**: Estilização da página e animação de fundo.
- **JavaScript**: Lógica de front-end e integração com APIs.
- **OpenCage Geocoding API**: Para converter endereços em coordenadas geográficas.
- **Azure Maps Weather API**: Para obter dados climáticos atuais.

## Pré-requisitos

- Um navegador web moderno (por exemplo, Google Chrome, Mozilla Firefox).
- Conexão com a internet para acessar as APIs.

## Como Executar o Projeto

Siga as instruções abaixo para configurar e executar o projeto localmente.

### Passo 1: Clonar o Repositório

git clone https://github.com/Lucas-dev98/airQuality
cd airQuality
### Passo 2: Obter Chaves de API

- **OpenCage**: Crie uma conta no [OpenCage](https://opencagedata.com/) e obtenha sua chave de API.
- **Azure Maps**: Crie uma conta no [Azure](https://azure.microsoft.com/) e obtenha a chave para a Azure Maps Weather API.

### Passo 3: Substituir as Chaves de API

Abra o arquivo `script.js` e substitua `SUA_CHAVE_OPENCAGE` e `SUA_CHAVE_AZURE` pelas suas chaves de API.

### Passo 4: Executar o Projeto

Abra o arquivo `index.html` no seu navegador para ver o aplicativo em ação.

---

### Estrutura do Projeto

/AirQuality
|-- /image
|   |-- earth-2768.gif      # GIF do globo giratório
|-- index.html              # HTML principal
|-- style.css               # Estilizações CSS
|-- script.js               # Lógica JavaScript
|-- README.md               # Documentação do projeto

### Contribuição

Contribuições são bem-vindas! Para contribuir com o projeto, siga os passos abaixo:

1. **Fork o repositório.**
2. **Crie uma branch para sua feature** (`git checkout -b minha-feature`).
3. **Faça commit das suas alterações** (`git commit -m 'Minha nova feature'`).
4. **Envie para o branch** (`git push origin minha-feature`).
5. **Abra um Pull Request.**

### Licença

Este projeto está licenciado sob a licença MIT. Consulte o arquivo `LICENSE` para obter mais informações.

### Contato

Para dúvidas ou sugestões, entre em contato:

- **Linkedin**: https://www.linkedin.com/in/lucas-oliveira-bastos/
- - **GitHub**: Lucas-dev98

### Agradecimentos

A experiência vivida na Campus Party foi transformadora. Participar das palestras e conversar com figuras inspiradoras como o saudoso Gustavo Guanabara e outros especialistas foi extremamente enriquecedor. Uma das frases que mais me marcou foi: **"Não sabe, aprende no processo."** Essa citação ressoou profundamente e se tornou um mantra ao longo do desenvolvimento deste projeto.

No início, eu não tinha a menor ideia de como utilizar uma API, mas a frase "não sabe, aprende no processo" me impulsionou a buscar conhecimento e superar desafios. A jornada de aprender a trabalhar com APIs foi um processo de descoberta e crescimento. Com a ideia já montada, a necessidade de entender a tecnologia me levou a explorar novas ferramentas e técnicas, transformando a incerteza inicial em uma valiosa experiência de aprendizado.

Este projeto é um reflexo desse aprendizado contínuo e da determinação de não desistir diante das dificuldades. A Campus Party e os ensinamentos dos especialistas foram fundamentais para me lembrar que cada obstáculo é uma oportunidade de crescimento. Agradeço a todos que contribuíram para essa jornada e às comunidades que compartilham conhecimento, tornando possível a realização deste projeto.





