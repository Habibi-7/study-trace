# @study-trace/obsidian

The Obsidian plugin. Records how you study a note into `<vault>/.study-trace/*.jsonl`.

## Install

```bash
pnpm --filter @study-trace/obsidian build
mkdir -p "<vault>/.obsidian/plugins/study-trace"
cp packages/obsidian/dist/main.js packages/obsidian/manifest.json "<vault>/.obsidian/plugins/study-trace/"
```

Enable **Study Trace** in Settings → Community plugins.

## Command

**Mark a question here.** The selected text (or the current line) becomes a question at that spot.

## Files

| File              | Does                                                 |
| ----------------- | ---------------------------------------------------- |
| `src/main.ts`     | wires up Obsidian: editor listener, window focus, files |
| `src/sitting.ts`  | one note being studied; feeds the Recorder, writes JSONL |
| `src/markdown.ts` | markdown → blocks, keeps block ids across edits      |
| `sim/`            | fake study sittings on a fake clock (`pnpm simulate "<vault>"`) |

## Dev

`pnpm dev` rebuilds on change. After copying a new build:
`obsidian plugin:reload id=study-trace` (Obsidian CLI), or toggle the plugin.
