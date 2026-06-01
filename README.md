# Condicoes Climaticas Atuais

Aplicacao web de clima e qualidade do ar com busca por cidade ou coordenadas, previsao de 5 dias, AQI, historico, favoritos e alertas.

## Stack Atual

- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express + TypeScript
- Graficos: Chart.js + react-chartjs-2
- API externa: OpenWeather

## Funcionalidades

- Clima atual por cidade ou coordenadas
- Previsao em blocos de 3h (5 dias)
- AQI e poluentes (PM2.5, PM10, NO2, O3)
- Geocoding e reverse geocoding
- Favoritos e historico no navegador
- Alertas climaticos (chuva, calor, vento, qualidade do ar)
- Alertas persistentes por e-mail (opcional, via Resend)
- Cache em memoria no backend (TTL de 10 minutos)
- Tema claro/escuro com persistencia
- i18n basico (PT-BR / EN)
- Widget de UV e horario de nascer/por do sol
- Historico climatico recente com grafico
- Painel multi-cidades (ate 5 cidades)
- Cockpit geoespacial no mapa com camadas climaticas (temperatura, chuva, nuvens, pressao, vento)
- Timeline no mapa com leitura de risco por periodo
- Heatmap de risco climatico com score operacional por segmento (agro/mobilidade/saude)
- Geofencing com desenho de zonas monitoradas no mapa
- Rota weather-aware com recomendacao de trajeto com menor risco
- Cluster geoespacial para comparador multi-cidades
- Compartilhamento por URL com parametros de busca
- Skeleton loading e lazy load dos graficos
- Comparador de cidades lado a lado
- Alertas personalizados por usuario (limites de calor, chuva, vento e AQI)
- Notificacoes de navegador para alertas relevantes
- PWA com suporte offline e instalacao no dispositivo
- Validacao de entrada com Zod no backend
- Rate limit, CORS configuravel e cabecalhos de seguranca (Helmet)
- Logs estruturados com Pino
- Cache distribuido opcional com Redis em producao (fallback para memoria)
- Testes automatizados (API e frontend)

## Estrutura do Projeto

```
airQuality/
    client/               # Frontend React + Vite + TypeScript
    image/                # Imagens estaticas
    private/.env          # Variaveis de ambiente locais
    src/server.ts         # Backend Express em TypeScript
    tsconfig.server.json  # Configuracao TS do backend
```

## Variaveis de Ambiente

Crie o arquivo `private/.env` com:

```
OPENWEATHER_API_KEY=sua_chave_aqui
```

Opcional para producao com Redis:

```
REDIS_URL=redis://usuario:senha@host:6379
REDIS_PREFIX=air-quality
```

Opcional para alertas por e-mail:

```
RESEND_API_KEY=sua_chave_resend
ALERT_EMAIL_FROM=alerts@seu-dominio.com
```

Opcional para cache HTTP estatico:

```
STATIC_CACHE_MAX_AGE_SECONDS=86400
```

Para deploy separado do frontend (Vercel) e backend (Render), configure no frontend:

```
VITE_API_BASE_URL=https://seu-backend.onrender.com
VITE_MAPBOX_TOKEN=seu_token_mapbox_aqui
```

## Rodando Localmente

1. Instale dependencias no root:

```bash
npm.cmd install
```

2. Instale dependencias do frontend:

```bash
npm.cmd --prefix client install
```

3. Rode backend + frontend em desenvolvimento:

```bash
npm.cmd run dev
```

4. Acesse:

- Frontend (Vite): `http://localhost:5173`
- API (Express): `http://localhost:3000`

## Build e Producao

1. Build completo:

```bash
npm.cmd run build
```

2. Subir servidor de producao:

```bash
npm.cmd run start
```

Em producao, o backend serve os arquivos gerados em `client/dist`.

## Testes

1. Executar todos os testes:

```bash
npm.cmd run test
```

2. Executar somente API:

```bash
npm.cmd run test:api
```

3. Executar somente frontend:

```bash
npm.cmd run test:web
```

## Endpoints da API

- `GET /api/weather?location=Lisboa&units=metric&lang=pt_br`
- `GET /api/weather?lat=38.72&lon=-9.13&units=metric&lang=pt_br`
- `GET /api/forecast?location=Lisboa&units=metric&lang=pt_br`
- `GET /api/geocode?location=Lisboa&limit=5`
- `GET /api/reverse-geocode?lat=38.72&lon=-9.13&limit=1`
- `GET /api/air-quality?lat=38.72&lon=-9.13`
- `GET /api/air-quality-forecast?lat=38.72&lon=-9.13`
- `GET /api/uv-index?lat=38.72&lon=-9.13&units=metric&lang=pt_br`
- `GET /api/weather-history?lat=38.72&lon=-9.13&units=metric&lang=pt_br&days=2`
- `GET /api/weather-tile/:layer/:z/:x/:y.png?ts=unix_timestamp`
- `GET /api/geofences/:profileId`
- `PUT /api/geofences/:profileId`
- `GET /api/user-preferences/:profileId`
- `PUT /api/user-preferences/:profileId`
- `POST /api/deliver-alert`

## Deploy

### Opcao A: Render (Web Service unico)

- Build Command: `npm install && npm --prefix client install && npm run build`
- Start Command: `npm run start`
- Environment: `OPENWEATHER_API_KEY`

Nesta opcao, o backend serve o frontend compilado em `client/dist`.

### Opcao B: API no Render + Frontend no Vercel

#### 1) Deploy da API (Render)

- Crie um Web Service no Render apontando para este repositorio
- Build Command:

```bash
npm install && npm run build
```

- Start Command:

```bash
npm run start
```

- Variavel de ambiente obrigatoria:

```bash
OPENWEATHER_API_KEY=sua_chave_aqui
```

#### 2) Deploy do Frontend (Vercel)

- Crie um projeto no Vercel usando a pasta raiz do repositorio
- Configure:
1. Framework Preset: `Vite`
2. Root Directory: `client`
3. Build Command: `npm run build`
4. Output Directory: `dist`

- Variavel de ambiente no Vercel:

```bash
VITE_API_BASE_URL=https://seu-backend.onrender.com
VITE_MAPBOX_TOKEN=seu_token_mapbox_aqui
```

Com isso, o frontend no Vercel consome a API hospedada no Render.

## CI/CD

O projeto ja inclui pipeline de CI no GitHub Actions:

- Arquivo: `.github/workflows/ci.yml`
- Etapas: install -> build -> test

## Troubleshooting

### 1) Erro de CORS no frontend

- Sintoma: requisicoes para `/api/*` bloqueadas no navegador
- Correcao:
1. Em deploy separado, defina `CORS_ORIGIN` no backend com o dominio do frontend (ex.: `https://seu-app.vercel.app`)
2. Verifique `VITE_API_BASE_URL` no frontend

### 2) OPENWEATHER_API_KEY ausente

- Sintoma: API retorna erro de chave nao configurada
- Correcao:
1. Defina `OPENWEATHER_API_KEY` no `private/.env` (local)
2. Defina a mesma variavel no provedor de deploy (Render)

### 3) Frontend aponta para API errada no Vercel

- Sintoma: frontend sobe, mas nao carrega dados de clima
- Correcao:
1. Configure `VITE_API_BASE_URL=https://seu-backend.onrender.com`
2. Refaça o deploy do frontend para aplicar a variavel

### 4) Mapa nao carrega

- Sintoma: bloco do mapa aparece vazio ou com erro de token
- Correcao:
1. Configure `VITE_MAPBOX_TOKEN` no frontend/Vercel
2. Verifique se o token do Mapbox esta ativo e com permissao para estilos

### 5) Limite de requisicoes atingido (429)

- Sintoma: resposta com mensagem de limite excedido
- Correcao:
1. Aguarde alguns minutos
2. Ajuste debounce no frontend se necessario
3. Revise `RATE_LIMIT_MAX` no backend para seu ambiente

Observacao: o rate limit considera IP + `x-client-id` (enviado pelo frontend), reduzindo impacto de NAT corporativo.

### 6) npm bloqueado no PowerShell (Windows)

- Sintoma: erro de Execution Policy ao rodar `npm`
- Correcao:
1. Use `npm.cmd` em vez de `npm`

### 7) Redis indisponivel em producao

- Sintoma: latencia maior e mais chamadas diretas para API externa
- Correcao:
1. Verifique se `REDIS_URL` esta correta
2. Verifique conectividade do servidor com o host Redis
3. Sem Redis, a aplicacao usa fallback de cache em memoria

### 7) PWA nao instala/offline nao funciona

- Sintoma: app nao aparece para instalar ou nao abre offline
- Correcao:
1. Use HTTPS em deploy
2. Abra uma vez online para service worker ser registrado
3. Verifique se o build foi feito com `npm run build`

## Licenca

MIT