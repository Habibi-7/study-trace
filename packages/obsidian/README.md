# @study-trace/obsidian

The Study Trace plugin for Obsidian. While you work in a note it records how you study —
where you write, stall, erase and rewrite, the questions you mark — into
`<vault>/.study-trace/*.jsonl`. Local only.

## Install

```bash
pnpm --filter @study-trace/obsidian build
mkdir -p "<vault>/.obsidian/plugins/study-trace"
cp packages/obsidian/dist/main.js packages/obsidian/manifest.json "<vault>/.obsidian/plugins/study-trace/"
```

Then Settings → Community plugins → enable **Study Trace**.

## Commands

- **Copy what a tutor would see (ContextPack)** — paste it into any chat.
- **Mark a question here (for your tutor)** — the selection (or the line) becomes a question at that spot.

## How it works

`src/markdown.ts` parses the note into blocks and keeps their ids across edits (markdown has
none); `src/sitting.ts` feeds `@study-trace/core`'s Recorder on the typing pause and writes
JSONL; `src/main.ts` wires it to Obsidian (a CodeMirror update listener, window focus, the
vault adapter). `Sitting` has no Obsidian imports — `sim/` drives it headlessly with a real
CodeMirror state on a virtual clock (`pnpm simulate "<vault>"`).

## Develop

`pnpm dev` rebuilds on change. `pnpm test` runs the parser, id matching and sitting tests.
With the Obsidian CLI: `obsidian plugin:reload id=study-trace` after copying a new build.
