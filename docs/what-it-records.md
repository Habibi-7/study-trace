---
title: What Study Trace records
last_updated: 2026-11-04
---

# What Study Trace records

A good tutor beside you can answer six questions at any moment. Everything recorded serves one:

| #   | Question                               | Answered by                                                                |
| --- | -------------------------------------- | -------------------------------------------------------------------------- |
| Q1  | What are they on right now?            | focus dwells, the last edit's section                                      |
| Q2  | What have they produced, in order?     | edits (acts)                                                               |
| Q3  | Are they stuck, and where?             | `stuck` and `big_erase` moments                                            |
| Q4  | What does the ink say?                 | sketch crops, where the editor has sketches (typed text is stored as text) |
| Q5  | How did the session go?                | the arc of moments                                                         |
| Q6  | What does it say about what they know? | later — a _reading_ of the log, never a direct verdict                     |

**Where** is free in a note: a block's section is the heading it sits under (`null` = above
the first heading).

## A sitting

One sitting per note opened _and worked in_ (a note opened and left untouched writes nothing).
Events are appended to `<vault>/.study-trace/<session>.jsonl`, ordered by `seq`.

| Event      | When                                              | Carries                                                                                                                                                                        |
| ---------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `session`  | open / close                                      | the note's path; on open, the note as it stood (`baseline`)                                                                                                                    |
| `act`      | the typing pause (800 ms) — one per block touched | op (create / edit / move / delete), the block after the pause, the text before, characters cut and typed, a plain summary ("typed …", "cut …", "ticked …", "made … a heading") |
| `focus`    | cursor or scroll held ≥2 s                        | cursor block, section, blocks on screen                                                                                                                                        |
| `landmark` | something a tutor would notice                    | see below                                                                                                                                                                      |
| `ask`      | a question marked in the note                     | the question, the block and section                                                                                                                                            |

**Moments (landmarks):**

- `first_attempt` — the first words of the sitting.
- `stuck` — the cursor parked in one of _your_ blocks for 45 s, window focused, no edits.
- `resumed` — the stall ended: by writing, asking, or taking a check; the label says which.
- `big_erase` — ≥40 characters cut, or ≥12 that were most of the block, or a written block deleted.
- `self_correction` — retyping where you erased within 2 minutes; replacing ≥30% of a block (or
  ≥20 characters) in one pause; or cutting a word or more and typing new words in its place.
  A typo fixed with a backspace or two is not one.
- `help_ask` — a question marked.

Constants live in `packages/core/src/recorder.ts`; tests in `recorder.test.ts`.

## Reading it

- `notesAt(view, t)` rebuilds the note exactly as it stood at any moment.
- **ContextPack** — what an LLM gets instead of the raw log: markdown with stable headings
  (_Right now · Where it was hard · Sections they worked in · Last 12 acts · Questions they
  asked_), about 300–2k tokens, plus the same facts as JSON. Runs of typing in one block merge
  into one line. It ends by saying it is a record of what happened, not a measure of what the
  learner knows.
- Over MCP: `get_recap`, `get_context_pack`, `get_moments`, `get_notes_at`, `list_sittings`.

## What it refuses to record

Keystrokes, pointer streams, screenshots of the screen, video, anything outside the note.

## Open

- Thresholds (45 s stuck, erase sizes) are constants; tune them from real sittings.
- Q6: a reading of the log into suggestions.
- Matching blocks across edits is by text; an insert right next to an edit can pair the wrong way round.
