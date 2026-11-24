/**
 * Study trace: what happened in a note, frame by frame — facts, not verdicts.
 *
 *   what they wrote and changed, in order  → act (the block before and after)
 *   when they stopped typing, and where     → quiet (cursor, screen, time away)
 *   what they wanted to ask                 → ask
 *
 * Whoever reads it (an LLM, a tutor) decides what it means.
 * "Where" is a section: the heading a block sits under (`null` = above the first heading).
 */

export const TRACE_KINDS = ["session", "act", "quiet", "ask"] as const;
export type TraceKind = (typeof TRACE_KINDS)[number];

/** A note block as the trace sees it: plain text, editor-agnostic. */
export type Block = {
  id: string;
  /** heading | paragraph | bulletListItem | numberedListItem | checkListItem | math | codeBlock */
  type: string;
  /** As typed, markdown and all. */
  text: string;
  /** Headings only. */
  level?: number;
  /** Checklist items only: ticked or not. */
  checked?: boolean;
};

/** A block plus the id of the block above it — enough to replay order exactly. */
export type Placed = Block & { after: string | null };

export type ActOp = "create" | "edit" | "move" | "delete";

export type SessionPayload = {
  op: "open" | "close";
  /** The note's path. */
  topic: string | null;
  /** On open: the note as it stood when they sat down. */
  baseline?: Placed[];
};

export type ActPayload = {
  op: ActOp;
  blockId: string;
  section: string | null;
  summary: string;
  /** The block after the pause; absent when it was deleted. */
  block?: Placed;
  /** Text before the pause, when it changed. */
  before?: string;
  /** Characters cut and typed in this pause. */
  cut?: number;
  typed?: number;
};

/** A stretch of at least `QUIET_MS` with no typing, written when typing resumes (or the sitting ends). */
export type QuietPayload = {
  /** When the stretch began; the event's `t` is when it ended. */
  from: number;
  ms: number;
  /** Where the cursor sat, in order, with how long (window-away time excluded). */
  spots: { blockId: string | null; section: string | null; ms: number }[];
  /** Time the Obsidian window wasn't focused. */
  awayMs: number;
  /** The blocks at the top and bottom of the screen when it ended. */
  view: { first: string; last: string } | null;
};

export type AskPayload = {
  text: string;
  /** The block their cursor was in, else null. */
  blockId: string | null;
  section: string | null;
};

export type TracePayloads = {
  session: SessionPayload;
  act: ActPayload;
  quiet: QuietPayload;
  ask: AskPayload;
};

export type TraceEvent<K extends TraceKind = TraceKind> = {
  [P in K]: { seq: number; t: number; kind: P; payload: TracePayloads[P] };
}[K];
