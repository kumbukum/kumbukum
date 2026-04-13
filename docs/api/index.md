# API Reference

Kumbukum exposes a REST API at `/api/v1/` for managing notes, memories, URLs, projects, and search.

## Base URL

```
https://your-instance.com/api/v1
```

## Authentication

All API endpoints require authentication via one of:

- **Bearer Token** (JWT) — `Authorization: Bearer <token>`
- **Access Token** — `Authorization: Token <access_token>`

See [Authentication](./authentication) for details.

## Endpoints Overview

| Resource    | Endpoints                                    |
| ----------- | -------------------------------------------- |
| Projects    | `GET /projects`, `GET /projects/:id`         |
| Notes       | `GET POST /notes`, `GET PUT DELETE /notes/:id` |
| Memories    | `GET POST /memories`, `GET PUT DELETE /memories/:id` |
| URLs        | `GET POST /urls`, `GET PUT DELETE /urls/:id` |
| Search      | `POST /search/knowledge`                     |
| Graph Links | `GET POST /graph-links`, `DELETE /graph-links/:id` |

## Interactive Reference

The full OpenAPI specification is available as an interactive reference in the sidebar under **OpenAPI Reference**.

You can also access the raw spec at [`/api-docs`](https://your-instance.com/api-docs) on your running instance.
