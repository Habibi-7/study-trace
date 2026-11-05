# @study-trace/mcp

Local, read-only MCP server over `<vault>/.study-trace`.

```bash
pnpm --filter @study-trace/mcp build
claude mcp add study-trace -- node /abs/path/packages/mcp/dist/index.js "/path/to/vault/.study-trace"
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "study-trace": {
      "command": "node",
      "args": ["/abs/path/packages/mcp/dist/index.js", "/path/to/vault/.study-trace"]
    }
  }
}
```

| Tool            | Args                     | Gives you                                   |
| --------------- | ------------------------ | ------------------------------------------- |
| `get_recap`     | `note?` `limit?`         | recent sittings, moments in time order      |
| `list_sittings` | `limit?`                 | when, how long, which note, counts          |
| `get_moments`   | `session?` `note?`       | every moment with time and section          |
| `get_notes_at`  | `session?` `note?` `at?` | the note as it was at that moment           |

`at` = `"m:ss"` into the sitting, ISO time, or epoch ms.
