# NOMAD MCP server

Lets agents (Claude Desktop, Cursor, Hermes…) drive NOMAD sessions through
the [Model Context Protocol](https://modelcontextprotocol.io).

## Status

V0 scaffold. The tool surface area is defined below; the actual MCP server
binary is implemented as a thin Python wrapper around the NOMAD REST API
(same auth model as the PWA — Bearer token).

## Planned tools

| Tool                              | Maps to                                          |
|-----------------------------------|--------------------------------------------------|
| `list_sessions(limit, filter)`    | `GET  /api/sessions`                             |
| `get_session(session_id)`         | `GET  /api/sessions/{id}`                        |
| `update_session(id, patch)`       | `PUT  /api/sessions/{id}`                        |
| `add_note(id, content)`           | `POST /api/sessions/{id}/notes`                  |
| `add_mark(id, time, label)`       | `POST /api/sessions/{id}/marks`                  |
| `set_tags(id, tag_names)`         | resolves names → ids, then `setSessionTags`      |
| `transcribe(id, engine?)`         | `POST /api/transcribe/{id}`                      |
| `search(query, since?, tag?)`     | `GET  /api/sessions?search=&tag=&created_after=` |
| `list_attachments(id)`            | `GET  /api/sessions/{id}/attachments`            |

## Running

```bash
# Local dev (TBD)
cd mcp
uv run nomad-mcp-server
```

The server reads `NOMAD_API_URL` + `NOMAD_API_TOKEN` from env. The token is
the same Bearer (Supabase session access_token or PocketID-issued JWT) the
PWA uses.

## Auth model

Single-user for V0 — the agent operates as Martin. Multi-user comes when
NOMAD itself opens to Jeanne + collaborators (the table already has user_id
columns and RLS, so the underlying REST endpoints are already scoped).

## Backlog item

`eb6ee127` in `app_nomad_dev.backlog`.
