# Study Trace

A silent tutor's eyes for wherever you already study. While you work through a note, Study
Trace records _how_ you work — where you write, stall, erase and rewrite, the questions you
mark — and reads it back as what a tutor sitting beside you would have noticed. Any AI agent
can read it over MCP.

```
 capture (per editor)        core                       read (any agent)
 ────────────────────        ────                       ────────────────
 Obsidian plugin ───────►  Recorder  ──► sittings ──►  ContextPack ──► MCP server ──► Claude, Cursor, …
 (Notion, VS Code: later)  @study-trace/core   .jsonl in your vault
```

Local only: sittings are JSONL files in `<vault>/.study-trace/`. Nothing leaves your machine.

## Packages

| Package                                  | What                                                                                                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`packages/core`](packages/core)         | Editor-agnostic core: the `Recorder` (edits, cursor, scroll, ticks → acts and moments), the read side (`readTrace`, `notesAt`), and `buildContextPack` — the compact summary an LLM gets. |
| [`packages/obsidian`](packages/obsidian) | The Obsidian plugin: markdown → blocks, stable ids across edits, a CodeMirror listener, JSONL in the vault. Plus a headless study simulator (`sim/`).                                     |
| [`packages/mcp`](packages/mcp)           | A local stdio MCP server over a vault's sittings: `list_sittings`, `get_recap`, `get_context_pack`, `get_moments`, `get_notes_at`.                                                        |

## What it notices

| Moment          | When                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| first words     | the first thing written in a sitting                                                                       |
| stuck           | the cursor parked in one block for 45 s, window focused, no edits                                          |
| resumed         | a stall ends — by writing, asking, or a check (the label says which)                                       |
| big erase       | ≥40 chars cut, or most of a block, or a deleted block                                                      |
| self-correction | rewriting where you erased; replacing a clause in one go; cutting a word and typing a new one in its place |
| question        | you marked one (Obsidian: _Mark a question here_)                                                          |

Everything else — what you typed, ticked, pasted, moved — is an ordered list of edits.
More in [docs/what-it-records.md](docs/what-it-records.md); design and next steps in
[docs/architecture.md](docs/architecture.md).

## Use it

```bash
pnpm install
pnpm build          # plugin → packages/obsidian/dist, server → packages/mcp/dist
pnpm test
```

Install the plugin into a vault:

```bash
mkdir -p "<vault>/.obsidian/plugins/study-trace"
cp packages/obsidian/dist/main.js packages/obsidian/manifest.json "<vault>/.obsidian/plugins/study-trace/"
```

Enable **Study Trace** under Settings → Community plugins, then let an agent read it:

```bash
claude mcp add study-trace -- node "$PWD/packages/mcp/dist/index.js" "<vault>/.study-trace"
```

Ask: _"What did I get stuck on in my last sitting?"_

## Try it without studying

`pnpm simulate "<vault>"` runs three scripted sittings through the plugin's real capture code
(a CodeMirror editor typed into keystroke by keystroke, on a virtual clock) and writes them into
the vault. The scripts in `packages/obsidian/sim/sittings.ts` expect notes shaped like a midterm
practice sheet; edit them for your own notes.
