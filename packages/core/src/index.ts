/**
 * The study trace, independent of any editor. An editor binding (the Obsidian plugin) feeds
 * the `Recorder`; anyone reads a sitting back with `readTrace`, `timeline` and `notesAt`.
 */
export * from "./read";
export * from "./recorder";
export * from "./types";
