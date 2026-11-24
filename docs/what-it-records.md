# What it records

Facts, not verdicts. Study Trace writes down what happened in the note — what changed, where
the cursor sat while nothing did, what you asked — and leaves the meaning to whoever reads it.

## A sitting

One note, opened and edited. Switching notes, 10 minutes without an edit or question, or the
note being reloaded from disk (a sync, a script) ends it. Open a note and touch nothing? Nothing
gets written.

Each sitting is one file: `<vault>/.study-trace/<session>.jsonl`. One event per line, each with
a `seq` (order) and `t` (epoch ms).

| Event     | When                                                       | Carries                                                                     |
| --------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `session` | open and close                                             | the note's path; on open, the whole note as it stood                        |
| `act`     | you pause typing for 800 ms — one per line you touched     | the line before and after, its section, and create / edit / move / delete   |
| `quiet`   | typing resumes after 10 s or more without it (or the end)  | how long, where the cursor sat and for how long, time away, what was on screen |
| `ask`     | you run _Mark a question here_ on a line or selection      | the question, its line and section                                          |

A block is one line: a heading, a list item, a task, a line of text, a code block or a `$$`
math block. Its section is the heading above it.

## Reading it back

`timeline()` turns a sitting into frames, one line each:

```
[1:23] wrote “45 sits in 40–47 → network 172.16.40.0”
[1:23–2:26] 63s without typing · cursor on “45 sits in 40–47 → network 172.16.40.0” 63s · on screen: …
[2:27] deleted the line “/20 = 255.255.248.0 so block size $256 - 248 = 8$ in the 3rd octet.”
```

Typing in one line across several pauses is one frame — unless you cut a word or more (4+
characters), which shows as its own `before → after`.

| MCP tool        | Gives you                                                                 |
| --------------- | ------------------------------------------------------------------------- |
| `get_recap`     | the last few sittings (default 3), each as frames, oldest first. Start here. |
| `get_sitting`   | one sitting as frames                                                     |
| `list_sittings` | id, when, how long, which note, edits, questions, longest pause           |
| `get_notes_at`  | the whole note as it stood at `m:ss` into a sitting                       |

## Never recorded

Keystrokes one by one, screenshots, anything outside the note, anything outside Obsidian.
