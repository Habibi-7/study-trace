/**
 * The study trace — what a silent tutor beside the notes remembers — independent of any
 * editor. A surface (an Obsidian plugin, a web editor, …) feeds the `Recorder` blocks,
 * cursor moves, scroll ranges and ticks; anyone reads it back with `readTrace` and
 * `buildContextPack`. Spec: docs/architecture/study-trace.md.
 */
export * from "./pack";
export * from "./read";
export * from "./recorder";
export * from "./types";
