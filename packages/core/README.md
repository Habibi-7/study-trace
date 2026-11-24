# @study-trace/core

The editor-agnostic part. Feed the `Recorder` blocks, keystrokes, cursor moves, the visible
range and window focus; it emits acts, quiet frames and asks. `readTrace` + `timeline` read a
sitting back as frames, and `notesAt` replays the note to any moment.

No DOM, no Node APIs, no timers. Runs anywhere.
