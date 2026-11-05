# What it records

## A sitting

One note, opened and edited. Switching notes ends it. Open a note and touch nothing? Nothing
gets written.

Each sitting is one file: `<vault>/.study-trace/<session>.jsonl`. One event per line, each with
a `seq` (order) and `t` (epoch ms).

```
0:00  session   open · note path + the note as it stood
0:05  act       typed “203.0.113.45/28 network is 203.0.113.40…”
0:05  landmark  first_attempt
0:52  landmark  stuck
0:52  landmark  resumed · asked for help after 47s quiet
0:52  ask       “is my network address right?”
0:52  landmark  help_ask
1:12  act       changed “40 because 45 rounds do…” → “32: blocks start at mul…”
1:12  landmark  self_correction
1:12  session   close
```

| Event      | When                                                        |
| ---------- | ----------------------------------------------------------- |
| `session`  | open and close                                              |
| `act`      | you pause typing for 800 ms (one per block you touched)     |
| `landmark` | a moment worth noticing (below)                             |
| `ask`      | you run _Mark a question here_ on a line or selection        |

Every event knows its **section**: the heading it sits under.

## Moments

| Moment            | Fires when                                                                |
| ----------------- | ------------------------------------------------------------------------- |
| `first_attempt`   | your first words of the sitting                                           |
| `stuck`           | cursor sits in one block for 45 s, Obsidian focused, no typing            |
| `resumed`         | a stall ends (you typed or asked)                                         |
| `big_erase`       | you cut 40+ chars, or 12+ that were most of the block, or delete a block |
| `self_correction` | you rewrite where you erased (within 2 min), replace a clause in one go, or swap a word |
| `help_ask`        | you mark a question                                                       |

A typo fixed with a couple of backspaces is not a moment.

Thresholds live in [`recorder.ts`](../packages/core/src/recorder.ts).

## Never recorded

Keystrokes, mouse, screenshots, scrolling, anything outside the note.

## Reading it back

| MCP tool        | Gives you                                                    |
| --------------- | ------------------------------------------------------------ |
| `get_recap`     | recent sittings, each with its moments in time order. Start here. |
| `list_sittings` | when, how long, which note, counts                            |
| `get_moments`   | every moment in one sitting, with time and section            |
| `get_notes_at`  | the note exactly as it was at `"m:ss"` (or ISO / epoch ms)    |

Pick a sitting with `session` (id) or `note` (part of the path). Default: the latest.
