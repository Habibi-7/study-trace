---
title: Architecture
status: Obsidian + MCP working; other editors proposed
last_updated: 2026-11-04
---

# Architecture

The value is the **watching** — a silent record of how someone studies, read back as what a
tutor beside them would have noticed. People already study in Obsidian, Notion and Google
Docs, so the layer is split in two and kept independent of any editor:

```
 capture (per surface)                 store                    read (any agent)
 ───────────────────────               ─────                    ────────────────
 Obsidian plugin ─────────┐                                    ┌─ MCP server → Claude, Cursor, …
 (Notion / Docs: later) ──┴─► Recorder ─► trace events ─► readTrace / ContextPack ─┤
                              @study-trace/core   JSONL                              └─ a tutor pane in the editor (next)
```

- **`packages/core`** — the editor-agnostic core: `Recorder` (pure: blocks, cursor, visible
  range, ticks in → events out), `readTrace`, `notesAt`, `buildContextPack`, `toMarkdown`.
  "Where" is a heading's section, which every note format has.
- **Capture adapters** turn a surface into blocks + cursor + scroll and call the Recorder.
- **Read** is the ContextPack, served to any agent over **MCP**.

## Capture: what each surface allows

| Surface          | Adapter                                                   | What we see                                                     | Fidelity                             |
| ---------------- | --------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------ |
| **Obsidian**     | plugin (`packages/obsidian`) — CodeMirror update listener | every edit, cursor, viewport, the note's headings               | **full**, local-first                |
| VS Code / Cursor | extension                                                 | edits, cursor, terminal                                         | full (not built)                     |
| Notion           | browser extension (page DOM) + API webhooks               | edits/cursor via the page (fragile); API alone = "page changed" | medium                               |
| Google Docs      | Drive revisions API, or extension                         | revision diffs every few minutes; Docs paints to a canvas       | low                                  |
| Anything         | screenshots + OCR                                         | pixels                                                          | low — and the privacy cost we refuse |

**Obsidian specifics.** Markdown has no block ids, so `reconcile()` carries ids across edits:
unchanged blocks keep theirs (LCS on type + text), and changed blocks between two unchanged
anchors are paired in order — an _edit_, not delete + create. Crude when an insert and an edit
sit side by side (they can be paired the wrong way round); fine for study notes. One sitting per
note opened and worked in. Events are appended to `<vault>/.study-trace/<session>.jsonl` —
inside the vault, hidden, never sent anywhere.

## Read: MCP

`packages/mcp` is a local stdio MCP server over that directory. Tools:

| Tool                                                 | Returns                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `get_recap` `{note?, limit?}`                        | several sittings' arc in one read — the best first call            |
| `list_sittings`                                      | recent sittings: when, how long, which note, edits, moments        |
| `get_context_pack` `{session?, note?, at?, format?}` | the tutor's summary (markdown or JSON)                             |
| `get_moments` `{session?, note?}`                    | stalls, erases, rewrites, marked questions — with time and section |
| `get_notes_at` `{session?, note?, at?}`              | the note as it stood at a moment                                   |

`at` is `"m:ss"` into the sitting, an ISO time, or epoch ms.

## Push vs pull

MCP is **pull**: an agent reads the trace only when someone asks it something. The
"tutor beside you" that notices a stall needs **push** — something running in the surface. In
Obsidian that's the plugin itself (today: "Mark a question here" and "Copy ContextPack";
next: a small tutor pane). Keep both: MCP for any agent, the plugin for the tutor.

## Next

1. Dogfood the Obsidian plugin on real sittings; tune `STUCK_MS` and erase sizes.
2. An in-Obsidian tutor pane (push) that calls a model with the pack + the note.
3. Optional sync of sittings to a server (cloud replay, curricula and checks as MCP tools).
4. Browser extension for Notion; VS Code extension for labs.
