# Configuration

All configuration is done through environment variables. Copy `.env.example` to `.env` and edit as needed.

## Application

| Variable         | Description                         | Default                 |
| ---------------- | ----------------------------------- | ----------------------- |
| `APP_URL`        | Public URL of the application       | `http://localhost:3000` |
| `PORT`           | Application port                    | `3000`                  |
| `SESSION_SECRET`  | Express session secret (required)   | —                       |
| `JWT_SECRET`     | JWT signing secret (required)       | —                       |
| `NODE_ENV`       | Environment: development, production | `development`          |

## Database

| Variable    | Description               | Default                          |
| ----------- | ------------------------- | -------------------------------- |
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/kumbukum` |
| `REDIS_URL` | Redis connection string   | `redis://localhost:6379`         |

## Search

| Variable            | Description              | Default                  |
| ------------------- | ------------------------ | ------------------------ |
| `TYPESENSE_HOST`    | Typesense server host    | `localhost`              |
| `TYPESENSE_PORT`    | Typesense server port    | `8108`                   |
| `TYPESENSE_API_KEY` | Typesense API key        | —                        |

## AI / LLM

| Variable       | Description                                  | Default  |
| -------------- | -------------------------------------------- | -------- |
| `LLM_PROVIDER` | AI provider: openai, google, groq, cerebras  | —        |
| `LLM_API_KEY`  | API key for the LLM provider                 | —        |
| `LLM_MODEL`    | Model name to use                            | —        |

## Email

| Variable        | Description          | Default |
| --------------- | -------------------- | ------- |
| `SMTP_HOST`     | SMTP server host     | —       |
| `SMTP_PORT`     | SMTP server port     | `587`   |
| `SMTP_USER`     | SMTP username        | —       |
| `SMTP_PASS`     | SMTP password        | —       |
| `EMAIL_FROM`    | Sender email address | —       |

## Reverse Proxy

When running behind a reverse proxy (nginx, Caddy, etc.), ensure:

1. Set `APP_URL` to your public domain
2. Proxy WebSocket connections to port 3001
3. Proxy MCP connections to port 3002
4. Set `X-Forwarded-For` and `X-Forwarded-Proto` headers

Example nginx configuration:

```nginx
server {
    listen 443 ssl;
    server_name your-instance.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /mcp {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```
