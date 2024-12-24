# Condições Climáticas Atuais 🌤️

Este é um projeto web que permite aos usuários verificar as condições climáticas atuais para qualquer localização fornecida. Ao inserir o nome de uma cidade ou endereço, o aplicativo usa a API OpenCage para converter o local em coordenadas geográficas e a API Azure Maps para exibir dados climáticos detalhados, incluindo temperatura, sensação térmica, umidade, vento e índice UV. O fundo animado do site apresenta um GIF de um globo giratório, proporcionando uma experiência visual envolvente.

## Funcionalidades

- **Busca de clima atual**: Insira coordenadas ou um endereço para obter informações climáticas em tempo real.
- **Conversão de endereço**: Use a API OpenCage para converter nomes de locais em coordenadas de latitude e longitude.
- **Dados climáticos detalhados**: Exibe temperatura, sensação térmica, umidade, velocidade do vento, direção do vento e índice UV.
- **Animação de fundo**: Um GIF de globo giratório é usado como plano de fundo para uma experiência mais imersiva.
- **Favicon**: Ícone personalizado para o site.

## Tecnologias Utilizadas

- **HTML5**: Estrutura da página web.
- **CSS3**: Estilização da página e animação de fundo.
- **JavaScript**: Lógica de front-end e integração com APIs.
- **Node.js**: Servidor backend.
- **Express**: Framework para Node.js.
- **OpenCage Geocoding API**: Para converter endereços em coordenadas geográficas.
- **Azure Maps Weather API**: Para obter dados climáticos atuais.

## Pré-requisitos

- Um navegador web moderno (por exemplo, Google Chrome, Mozilla Firefox).
- Conexão com a internet para acessar as APIs.

## Como Executar o Projeto

Siga as instruções abaixo para configurar e executar o projeto localmente.

### Passo 1: Clonar o Repositório

Clone o repositório do GitHub e navegue até o diretório do projeto.

### Passo 2: Obter Chaves de API

- **OpenCage**: Crie uma conta no [OpenCage](https://opencagedata.com/) e obtenha sua chave de API.
- **Azure Maps**: Crie uma conta no [Azure](https://azure.microsoft.com/) e obtenha a chave para a Azure Maps Weather API.

### Passo 3: Configurar Variáveis de Ambiente

Crie um arquivo `.env` na pasta `private` e adicione suas chaves de API.

### Passo 4: Instalar Dependências

Instale as dependências do projeto.

### Passo 5: Executar o Projeto

Inicie o servidor Node.js e abra o navegador para acessar o aplicativo.

## Como Adicionar o Favicon

1. Coloque o arquivo `icon.png` na pasta `public`.
2. Atualize o arquivo `index.html` para incluir o favicon.

## Como Fazer o Deploy

### Usando Render

1. Crie uma conta no [Render](https://render.com/).
2. Conecte seu repositório GitHub ao Render.
3. Configure o serviço web:
    - **Build Command**: `npm install`
    - **Start Command**: `node server.js`
4. Adicione as variáveis de ambiente no painel do Render.
5. Inicie o deploy.

### Estrutura do Projeto

Certifique-se de que a estrutura do seu projeto está correta.

## Contribuição

Contribuições são bem-vindas! Para contribuir com o projeto, siga os passos abaixo:

1. **Fork o repositório.**
2. **Crie uma branch para sua feature**.
3. **Faça commit das suas alterações**.
4. **Envie para o branch**.
5. **Abra um Pull Request.**

## Licença

Este projeto está licenciado sob a licença MIT. Consulte o arquivo `LICENSE` para obter mais informações.

## Contato

Para dúvidas ou sugestões, entre em contato:

- **Linkedin**: https://www.linkedin.com/in/lucas-oliveira-bastos/
- **GitHub**: Lucas-dev98

## Agradecimentos

A experiência vivida na Campus Party foi transformadora. Participar das palestras e conversar com figuras inspiradoras como o saudoso Gustavo Guanabara e outros especialistas foi extremamente enriquecedor. Uma das frases que mais me marcou foi: **"Não sabe, aprende no processo."** Essa citação ressoou profundamente e se tornou um mantra ao longo do desenvolvimento deste projeto.

No início, eu não tinha a menor ideia de como utilizar uma API, mas a frase "não sabe, aprende no processo" me impulsionou a buscar conhecimento e superar desafios. A jornada de aprender a trabalhar com APIs foi um processo de descoberta e crescimento. Com a ideia já montada, a necessidade de entender a tecnologia me levou a explorar novas ferramentas e técnicas, transformando a incerteza inicial em uma valiosa experiência de aprendizado.

Este projeto é um reflexo desse aprendizado contínuo e da determinação de não desistir diante das dificuldades. A Campus Party e os ensinamentos dos especialistas foram fundamentais para me lembrar que cada obstáculo é uma oportunidade de crescimento. Agradeço a todos que contribuíram para essa jornada e às comunidades que compartilham conhecimento, tornando possível a realização deste projeto.

## Hospedagem

O projeto está hospedado no Render e pode ser acessado em: [https://airquality-vqcq.onrender.com/](https://airquality-vqcq.onrender.com/)