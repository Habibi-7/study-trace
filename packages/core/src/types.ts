/**
 * Study trace — what a silent tutor sitting beside the notes remembers.
 * Spec: docs/architecture/study-trace.md. Every field serves one of six questions:
 *
 *   Q1 what are they on now      → focus dwells, last act's block
 *   Q2 what have they produced   → ordered acts
 *   Q3 stuck, and where          → stuck / big_erase landmarks
 *   Q4 what the ink says         → sketch crops (text is stored as text)
 *   Q5 how did it go             → landmark arc
 *   Q6 what they know            → later, a *reading* of this log. Nothing here updates mastery.
 *
 * "Where" is a section: the heading a block sits under (`null` = above the first heading).
 */

export const TRACE_KINDS = ["session", "act", "focus", "landmark", "evidence", "ask"] as const;
export type TraceKind = (typeof TRACE_KINDS)[number];

export type Who = "learner" | "tutor";

/** A note block as the trace sees it: plain text, editor-agnostic. */
export type Block = {
  id: string;
  /** heading | paragraph | bulletListItem | numberedListItem | checkListItem | math | sketch | … */
  type: string;
  /** As typed. Math: its plain source (`sqrt(x^2+1)`); inline math as `$…$`. Sketch: "". */
  text: string;
  /** The same content as LaTeX, only when there is math. For renderers, not readers. */
  latex?: string;
  /** Headings only. */
  level?: number;
  /** Sketches only: how many marks the drawing holds. */
  marks?: number;
  /** Checklist items only: ticked or not. */
  checked?: boolean;
};

/** A block plus the id of the block above it — enough to replay order exactly. */
export type Placed = Block & { after: string | null };

export type ActOp = "create" | "edit" | "move" | "delete" | "stroke" | "erase";

export type SessionPayload = {
  op: "open" | "topic" | "close";
  /** The curriculum topic they had open, if any. */
  topic: string | null;
  /** On open: the notes as they stood when they sat down. */
  baseline?: Placed[];
};

export type ActPayload = {
  op: ActOp;
  who: Who;
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

export type FocusPayload = {
  from: number;
  to: number;
  /** Where the cursor sat. */
  blockId: string | null;
  section: string | null;
  /** Blocks on screen, by reading-order index. */
  first: number;
  last: number;
};

export type LandmarkKind =
  | "first_attempt"
  | "stuck"
  | "resumed"
  | "big_erase"
  | "self_correction"
  | "help_ask"
  /** The tutor placed a lesson they asked for. */
  | "taught"
  /** They took a topic check. Observed here; mastery moves only through the check itself. */
  | "checked";

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

export type EvidencePayload = {
  /** The moment this picture belongs to; absent for a sketch caught mid-drawing. */
  landmarkSeq?: number;
  blockId: string;
  image: string;
  w: number;
  h: number;
};

export type AskPayload = {
  text: string;
  /** The block their cursor was in, else null (= what was on screen). */
  blockId: string | null;
  section: string | null;
};

export type TracePayloads = {
  session: SessionPayload;
  act: ActPayload;
  focus: FocusPayload;
  landmark: LandmarkPayload;
  evidence: EvidencePayload;
  ask: AskPayload;
};

export type TraceEvent<K extends TraceKind = TraceKind> = {
  [P in K]: { seq: number; t: number; kind: P; payload: TracePayloads[P] };
}[K];
