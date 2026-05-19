# NOMAD MCP server

Lets agents (Claude Desktop, Cursor, Hermes…) drive NOMAD sessions through
the [Model Context Protocol](https://modelcontextprotocol.io).

## Tools

| Tool                                  | Maps to                                  |
|---------------------------------------|------------------------------------------|
| `list_sessions(limit, status, …)`     | `GET  /api/sessions`                     |
| `get_session(session_id)`             | `GET  /api/sessions/{id}`                |
| `update_session(id, patch)`           | `PUT  /api/sessions/{id}`                |
| `add_note(id, content)`               | `POST /api/sessions/{id}/notes`          |
| `add_mark(id, time_ms, label)`        | `POST /api/sessions/{id}/marks`          |
| `list_tags()`                         | `GET  /api/tags`                         |
| `set_tags(id, tag_names)`             | resolves names → ids + sets the set      |
| `transcribe(id, engine)`              | `POST /api/transcribe/{id}`              |
| `list_attachments(id)`                | `GET  /api/sessions/{id}/attachments`    |

## Install

```bash
cd mcp
uv pip install -e .
# or: pip install -e .
```

## Run

```bash
NOMAD_API_URL=https://nomad-api.mgdesign.cloud \
NOMAD_API_TOKEN=<your-bearer-token> \
python server.py
```

The server speaks MCP over stdio. Wire it into Claude Desktop with:

```json
{
  "mcpServers": {
    "nomad": {
      "command": "python",
      "args": ["/home/greenm/docker/nomad/mcp/server.py"],
      "env": {
        "NOMAD_API_URL": "https://nomad-api.mgdesign.cloud",
        "NOMAD_API_TOKEN": "<bearer>"
      }
    }
  }
}
```

`NOMAD_API_TOKEN` is the same Bearer (Supabase access_token or
PocketID-issued JWT) the PWA uses. Single-user for V0 — the agent operates
as the token's owner.

## Backlog

`eb6ee127` in `app_nomad_dev.backlog`.
