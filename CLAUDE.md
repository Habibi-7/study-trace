# Study Trace

Obsidian plugin records how someone studies a note → JSONL in `<vault>/.study-trace/` → MCP server reads it back to any agent.

## Done means proven on real data
Tests passing is not done. Build, install into a real vault, do the thing in real Obsidian, read the JSONL and the MCP output.
- Build + install: `pnpm build && cp packages/obsidian/dist/main.js packages/obsidian/manifest.json "<vault>/.obsidian/plugins/study-trace/"`
- Drive Obsidian: `obsidian vault="<name>" plugin:reload id=study-trace | open path=… | eval code=… | dev:cdp method=Input.insertText params='{"text":"…"}' | dev:errors`. The CLI hangs after printing; wrap it: `perl -e 'alarm 20; exec @ARGV' obsidian …`.

## Traps (each one bit us)
- Not every doc change is the learner. A reload from disk (sync, script, git) is a CodeMirror transaction with userEvent `set`: it ends the sitting, never counts as edits. Checkbox clicks and editor-API edits carry no userEvent but are the learner — don't filter on "has a userEvent".
- Switching notes in a tab is `setState`, not a transaction; the next update shows the new file.
- Sittings must end: 10 min without an edit or question closes one (`IDLE_END_MS`).
- The simulator only exercises `Sitting`, not `main.ts` — the Obsidian wiring needs a live run.
