# Study Trace

Obsidian plugin records how someone studies a note → JSONL in `<vault>/.study-trace/` → MCP server reads it back to any agent as plain frames.

**Facts, not verdicts.** Record what happened (text before/after, pauses, cursor, screen); never label it ("stuck", "self-correction"). The reader decides. Labels hid the actual mistake in the first real sitting.

## Done means proven on real data
Tests passing is not done. The code is the docs: no docs/ folder; comments say why. Build, install into a real vault, do the thing in real Obsidian, read the JSONL and the MCP output.
- Build + install: `pnpm build && cp packages/obsidian/dist/main.js manifest.json "<vault>/.obsidian/plugins/study-trace/"`
- Drive Obsidian: `obsidian vault="<name>" plugin:reload id=study-trace | open path=… | eval code=… | dev:cdp method=Input.insertText params='{"text":"…"}' | dev:errors`. The CLI hangs after printing; wrap it: `perl -e 'alarm 20; exec @ARGV' obsidian …`.

## Traps (each one bit us)
- Not every doc change is the learner. A reload from disk (sync, script, git) is a CodeMirror transaction with userEvent `set`: it ends the sitting, never counts as edits. Checkbox clicks and editor-API edits carry no userEvent but are the learner — don't filter on "has a userEvent".
- Switching notes in a tab is `setState`, not a transaction; the next update shows the new file.
- Sittings must end: 10 min without an edit or question closes one (`IDLE_END_MS`).
- Unit tests only exercise `Sitting` and core, not `main.ts` — the Obsidian wiring needs a live run.
- A block is one line. Whole markdown paragraphs as blocks made every frame repeat the paragraph.
- A quiet frame shows the note as it stood *during* the pause (`notesAt(t - 1)`), not after the edit that ended it.
- Typing runs merge into one frame, but a cut of 4+ chars starts a new one — otherwise "…254 → …255" vanishes into "wrote …255".
- Live check: `scripts/replay-session.sh "<vault name>"` studies a fresh practice sheet in real Obsidian (~5 min), then read `get_recap` and compare it with what the script did.
