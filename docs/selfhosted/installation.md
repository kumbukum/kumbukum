# Installation

## Running with Docker Compose

```bash
git clone https://github.com/kumbukum/kumbukum.git
cd kumbukum
cp .env.example .env  # edit with your settings
docker compose up -d
```

The app will be available at `http://localhost:3000`.

## Services

| Service    | Port  | Description                   |
| ---------- | ----- | ----------------------------- |
| App        | 3000  | Main Express application      |
| WebSocket  | 3001  | Real-time updates             |
| MCP Server | 3002  | Model Context Protocol server |
| MongoDB    | 27017 | Database                      |
| Redis      | 6379  | Caching & pub/sub             |
| Typesense  | 8108  | Full-text & vector search     |

## Environment Variables

See [Configuration](/selfhosted/configuration) for the full list. Key variables:

| Variable         | Description                                  |
| ---------------- | -------------------------------------------- |
| `MONGO_URI`      | MongoDB connection string                    |
| `REDIS_URL`      | Redis connection string                      |
| `SESSION_SECRET`  | Express session secret                       |
| `JWT_SECRET`     | JWT signing secret                           |
| `APP_URL`        | Public URL of the application                |
| `LLM_PROVIDER`   | AI provider: openai, google, groq, cerebras  |
| `LLM_API_KEY`    | API key for the LLM provider                 |
| `LLM_MODEL`      | Model name to use                            |

## Local Development

```bash
pnpm install
pnpm dev
```

This starts the app with `nodemon` for auto-reload on file changes.

## Building Assets

```bash
pnpm build
```

Builds frontend assets (vendor.js, vendor.css, editor.js, graph_bundle.js) with esbuild.
