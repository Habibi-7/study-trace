/**
 * Study trace: what a silent tutor sitting beside the notes remembers.
 *
 *   what they produced, in order  → acts
 *   where it was hard             → stuck / big_erase / self_correction landmarks
 *   what they wanted to ask       → asks
 *
 * "Where" is a section: the heading a block sits under (`null` = above the first heading).
 */

export const TRACE_KINDS = ["session", "act", "landmark", "ask"] as const;
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

export type LandmarkKind =
  | "first_attempt"
  | "stuck"
  | "resumed"
  | "big_erase"
  | "self_correction"
  | "help_ask";

export type LandmarkPayload = {
  kind: LandmarkKind;
  label: string;
  blockId: string | null;
  section: string | null;
  /** stuck: quiet since. */
  since?: number;
  /** resumed: how long the stall lasted. */
  quietMs?: number;
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
  landmark: LandmarkPayload;
  ask: AskPayload;
};

export type TraceEvent<K extends TraceKind = TraceKind> = {
  [P in K]: { seq: number; t: number; kind: P; payload: TracePayloads[P] };
}[K];
