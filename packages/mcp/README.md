# @study-trace/mcp

Lets any MCP client (Claude Desktop, Claude Code, Cursor, …) read how you've been studying: the
sittings the Obsidian plugin records in `<vault>/.study-trace`. Local, read-only, stdio.

## Build

```bash
pnpm --filter @study-trace/mcp build     # → packages/mcp/dist/index.js
```

## Add to Claude Code

```bash
claude mcp add study-trace -- node /absolute/path/to/packages/mcp/dist/index.js "/path/to/vault/.study-trace"
```

## Add to Claude Desktop

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "study-trace": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp/dist/index.js", "/path/to/vault/.study-trace"]
    }
  }
}
```

## Tools

| Tool                                                 | Returns                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| `get_recap` `{note?, limit?}`                        | the arc across recent sittings — the best first call          |
| `list_sittings` `{limit?}`                           | when, how long, which note, edits, moments                    |
| `get_context_pack` `{session?, note?, at?, format?}` | what a tutor beside you would have noticed (markdown or JSON) |
| `get_moments` `{session?, note?}`                    | stalls, erases, rewrites, questions — with time and section   |
| `get_notes_at` `{session?, note?, at?}`              | the note as it stood at a moment                              |

`at` is `"m:ss"` into the sitting, an ISO time, or epoch ms.
