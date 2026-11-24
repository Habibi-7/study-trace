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

| Tool            | Args                     | Gives you                                                  |
| --------------- | ------------------------ | ---------------------------------------------------------- |
| `get_recap`     | `note?` `limit?`         | the last few sittings as frames, oldest first              |
| `get_sitting`   | `session?` `note?`       | one sitting as frames                                      |
| `list_sittings` | `limit?`                 | id, when, how long, which note, edits, questions, longest pause |
| `get_notes_at`  | `session?` `note?` `at?` | the whole note as it stood at that moment                  |

`at` = `"m:ss"` into the sitting, ISO time, or epoch ms.
