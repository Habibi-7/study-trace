# @study-trace/core

The editor-agnostic core. A surface feeds the `Recorder` blocks, cursor moves, visible ranges
and ticks; it emits acts, focus dwells and moments. `readTrace`, `notesAt` and
`buildContextPack` read a sitting back — the last one as the compact summary an LLM gets.

No editor, DOM or Node APIs: runs in a plugin, a server, or a test.
