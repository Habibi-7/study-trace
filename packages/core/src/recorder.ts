import { clip, placed, sectionOf } from "./read";
import type {
  ActPayload,
  Block,
  LandmarkKind,
  TraceEvent,
  TraceKind,
  TracePayloads,
} from "./types";

/**
 * The tutor's eyes on the notes: acts on the typing pause, landmarks when something
 * changes. "Where" is the heading a block sits under; "still" is the cursor parked in
 * one block.
 *
 * Pure — no DOM, no timers. The editor binding feeds it changes, cursor moves and
 * ticks, and calls `commit()` on the pause.
 */

/** Acts commit when typing pauses — not per keystroke. */
export const TYPING_IDLE_MS = 800;
/** Cursor parked in one block, no edits, tab visible → stuck. */
export const STUCK_MS = 45_000;
/** A big erase: this many chars cut in one pause… */
export const BIG_ERASE_CHARS = 40;
/** …or at least this many that were most of the block. */
export const BIG_ERASE_MIN_CHARS = 12;
export const BIG_ERASE_FRACTION = 0.5;
/** Cut-and-retype inside one pause, both at least this long → a rewrite. */
export const REWRITE_MIN_CHARS = 8;
/** …or a clause this long replaced in a long block. */
export const REWRITE_CLAUSE_CHARS = 20;
/** A cut this small (a word, not a typo) followed by new words in its place → a change of mind. */
export const SMALL_CUT_CHARS = 4;
export const CHANGE_WINDOW_MS = 30_000;
/** Retyping where they erased, within this window → self-correction. */
export const CORRECTION_WINDOW_MS = 120_000;

export type RecorderDeps = {
  now: () => number;
  /** Persist one event; returns its seq. */
  emit: <K extends TraceKind>(kind: K, payload: TracePayloads[K], t?: number) => number;
  isVisible: () => boolean;
};

/** Characters cut and typed between two versions of one block's text. */
export function textDelta(before: string, after: string): { cut: string; typed: string } {
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start++;
  let end = 0;
  while (end < max - start && before[before.length - 1 - end] === after[after.length - 1 - end]) {
    end++;
  }
  return {
    cut: before.slice(start, before.length - end),
    typed: after.slice(start, after.length - end),
  };
}

/**
 * Blocks that really moved: survivors outside the longest run that kept its
 * order. Dragging one block down shifts its neighbours, but only it moved.
 */
export function movedBlocks(before: Block[], after: Block[]): Set<string> {
  const position = new Map(before.map((b, i) => [b.id, i]));
  const kept = after.filter((b) => position.has(b.id)).map((b) => b.id);
  const seq = kept.map((id) => position.get(id) ?? 0);
  // O(n²) longest increasing run — notes are hundreds of blocks at most.
  const length = seq.map(() => 1);
  const from = seq.map(() => -1);
  let best = -1;
  seq.forEach((here, i) => {
    for (let j = 0; j < i; j++) {
      if ((seq[j] ?? 0) < here && (length[j] ?? 0) + 1 > (length[i] ?? 0)) {
        length[i] = (length[j] ?? 0) + 1;
        from[i] = j;
      }
    }
    if (best < 0 || (length[i] ?? 0) > (length[best] ?? 0)) best = i;
  });
  const stayed = new Set<string>();
  for (let i = best; i >= 0; i = from[i] ?? -1) stayed.add(kept[i] ?? "");
  return new Set(kept.filter((id) => !stayed.has(id)));
}

const same = (a: Block, b: Block) =>
  a.type === b.type && a.text === b.text && a.level === b.level && a.checked === b.checked;

export class Recorder {
  /** Everything emitted this sitting — a live reader reads from here. */
  readonly log: TraceEvent[] = [];

  private committed: Block[] = [];
  private latest: Block[] = [];
  private started = false;
  private stopped = false;

  private firstAttemptDone = false;
  private lastEditAt = 0;
  private stuckSince: number | null = null;
  private pendingCorrection: { blockId: string; section: string | null; t: number } | null = null;
  /** A small cut (a word or two) that the next words typed there may replace. */
  private lastCut: { blockId: string; text: string; t: number } | null = null;

  private cursorBlock: string | null = null;
  private parkedSince = 0;

  constructor(private readonly deps: RecorderDeps) {}

  start(blocks: Block[], topic: string | null) {
    if (this.started) return;
    this.started = true;
    this.committed = this.latest = blocks;
    this.lastEditAt = this.deps.now();
    this.emit("session", { op: "open", topic, baseline: placed(blocks) });
  }

  stop() {
    if (!this.started || this.stopped) return;
    this.commit();
    this.stopped = true;
    this.emit("session", { op: "close", topic: null });
  }

  /** The notes changed. The binding calls `commit()` after the typing pause. */
  change(blocks: Block[]) {
    if (this.live) this.latest = blocks;
  }

  /** Diff what was last committed against now: one act per touched block. */
  commit() {
    if (!this.live || this.latest === this.committed) return;
    const before = this.committed;
    const after = this.latest;
    this.committed = after;
    const prevById = new Map(before.map((b) => [b.id, b]));
    const moved = movedBlocks(before, after);

    after.forEach((block, i) => {
      const prev = prevById.get(block.id) ?? null;
      if (prev && same(prev, block) && !moved.has(block.id)) return;
      const act = this.describe(prev, block);
      this.record({ ...act, block: { ...block, after: after[i - 1]?.id ?? null } }, prev, block);
    });

    const kept = new Set(after.map((b) => b.id));
    for (const block of before) {
      if (kept.has(block.id)) continue;
      this.record(
        {
          op: "delete",
          blockId: block.id,
          section: sectionOf(before, block.id),
          summary: block.text.trim()
            ? `deleted “${clip(block.text)}”`
            : `deleted an empty ${block.type}`,
          ...(block.text ? { before: block.text, cut: block.text.length } : {}),
        },
        block,
        null,
      );
    }
  }

  /** Cursor moved. Only block changes matter — arrowing inside a block is still "parked". */
  setCursor(blockId: string | null) {
    if (!this.live || blockId === this.cursorBlock) return;
    this.cursorBlock = blockId;
    this.parkedSince = this.deps.now();
    if (this.stuckSince !== null && blockId !== null) this.resume(blockId);
  }

  /** Tab came back: time away is neither looking nor stuck. */
  visible() {
    const now = this.deps.now();
    if (this.stuckSince === null) {
      this.parkedSince = Math.max(this.parkedSince, now);
      this.lastEditAt = Math.max(this.lastEditAt, now);
    }
  }

  hidden() {
    this.commit();
  }

  /** Called every few seconds by the binding. */
  tick() {
    if (!this.live || this.stuckSince !== null || !this.deps.isVisible()) return;
    if (this.cursorBlock === null) return;
    const now = this.deps.now();
    const since = Math.max(this.lastEditAt, this.parkedSince);
    if (now - since < STUCK_MS) return;
    const block = this.committed.find((b) => b.id === this.cursorBlock);
    if (!block) return;
    const section = sectionOf(this.committed, block.id);
    this.stuckSince = since;
    this.landmark(
      "stuck",
      `Cursor parked ${Math.round((now - since) / 1000)}s, no edits`,
      block.id,
      section,
      { since },
    );
  }

  /** An ask happened at the cursor. */
  ask(text: string) {
    if (!this.live) return;
    this.commit();
    const blockId = this.committed.some((b) => b.id === this.cursorBlock) ? this.cursorBlock : null;
    const section = sectionOf(this.committed, blockId);
    if (this.stuckSince !== null) this.resume(blockId, "Asked for help");
    this.emit("ask", { text, blockId, section });
    this.landmark("help_ask", `Asked: ${clip(text, 60)}`, blockId, section);
    // Waiting on an answer is not freezing.
    this.lastEditAt = this.deps.now();
  }

  // --- acts --------------------------------------------------------------------

  private get live() {
    return this.started && !this.stopped;
  }

  private describe(prev: Block | null, next: Block): ActPayload {
    const base = { blockId: next.id, section: sectionOf(this.committed, next.id) };

    if (prev === null) {
      const summary = next.text.trim()
        ? `wrote “${clip(next.text)}”`
        : `new ${next.type === "heading" ? "heading" : "line"}`;
      return { ...base, op: "create", summary, ...(next.text ? { typed: next.text.length } : {}) };
    }

    if (prev.checked !== next.checked && prev.text === next.text) {
      return {
        ...base,
        op: "edit",
        summary: `${next.checked ? "ticked" : "unticked"} “${clip(next.text, 40)}”`,
      };
    }

    const retyped = prev.type !== next.type || prev.level !== next.level;
    if (prev.text !== next.text && !(retyped && prev.text.trim() === next.text.trim())) {
      const { cut, typed } = textDelta(prev.text, next.text);
      if (!cut.trim() && !typed.trim()) {
        return {
          ...base,
          op: "edit",
          summary: "tidied spacing",
          before: prev.text,
          cut: cut.length,
          typed: typed.length,
        };
      }
      return {
        ...base,
        op: "edit",
        summary:
          cut && typed
            ? `changed “${clip(cut, 24)}” → “${clip(typed, 24)}”`
            : cut
              ? `cut “${clip(cut, 32)}”`
              : `typed “${clip(typed, 40)}”`,
        before: prev.text,
        cut: cut.length,
        typed: typed.length,
      };
    }

    if (retyped) {
      return {
        ...base,
        op: "edit",
        summary: `made “${clip(next.text || next.type, 32)}” a ${next.type}`,
      };
    }
    return { ...base, op: "move", summary: `moved “${clip(next.text || next.type, 32)}”` };
  }

  // --- landmarks ---------------------------------------------------------------

  private record(act: ActPayload, prev: Block | null, next: Block | null) {
    this.emit("act", act);
    const now = this.deps.now();
    const { blockId, section } = act;

    if (this.stuckSince !== null) this.resume(blockId);

    const cut = act.cut ?? 0;
    const typed = act.typed ?? 0;
    const authoring = typed > 0;
    const share = cut / Math.max(1, prev?.text.length ?? 0);
    const pending = this.pendingCorrection;

    // Replacing a real chunk of what they'd written — most of a short line, or a clause of a long one.
    const rewroteInPlace =
      prev !== null &&
      next !== null &&
      cut >= REWRITE_MIN_CHARS &&
      typed >= REWRITE_MIN_CHARS &&
      (share >= 0.3 || cut >= REWRITE_CLAUSE_CHARS);
    const bigCut =
      cut >= BIG_ERASE_CHARS || (cut >= BIG_ERASE_MIN_CHARS && share >= BIG_ERASE_FRACTION);
    const deletedBlock =
      next === null && prev !== null && prev.text.trim().length >= BIG_ERASE_MIN_CHARS;
    const changedWord =
      this.lastCut !== null &&
      this.lastCut.blockId === blockId &&
      act.op === "edit" &&
      cut === 0 &&
      typed >= SMALL_CUT_CHARS &&
      now - this.lastCut.t < CHANGE_WINDOW_MS
        ? this.lastCut.text
        : null;
    const correctsErase =
      pending !== null &&
      authoring &&
      now - pending.t < CORRECTION_WINDOW_MS &&
      (pending.blockId === blockId ||
        // The erased block is gone; retyping in its section is the rewrite.
        (!this.committed.some((b) => b.id === pending.blockId) && pending.section === section));

    // Labels say what happened; "where" travels separately as the section.
    if (rewroteInPlace) {
      const { cut: was, typed: now_ } = textDelta(prev.text, next.text);
      this.landmark(
        "self_correction",
        `Rewrote “${clip(was, 24)}” as “${clip(now_, 24)}”`,
        blockId,
        section,
      );
      this.pendingCorrection = null;
    } else if (bigCut || deletedBlock) {
      const label = deletedBlock
        ? "Deleted a whole block"
        : `Cut ${cut} chars (${Math.round(share * 100)}%)`;
      this.landmark("big_erase", label, blockId, section);
      this.pendingCorrection = { blockId, section, t: now };
    } else if (correctsErase) {
      this.landmark("self_correction", "Rewrote where they erased", blockId, section);
      this.pendingCorrection = null;
    } else if (changedWord && prev && next) {
      // "class B" cut, then "class A …" typed in its place: a change of mind, not a typo.
      const typedNow = textDelta(prev.text, next.text).typed;
      this.landmark(
        "self_correction",
        `Changed “${clip(changedWord, 24)}” to “${clip(typedNow, 24)}”`,
        blockId,
        section,
      );
    } else if (!this.firstAttemptDone && authoring) {
      this.landmark("first_attempt", "First words", blockId, section);
    }
    if (authoring) this.firstAttemptDone = true;
    // Remember a small deliberate cut; anything else in this block clears it.
    this.lastCut =
      act.op === "edit" && cut >= SMALL_CUT_CHARS && typed === 0 && !bigCut && prev
        ? { blockId, text: textDelta(prev.text, next?.text ?? "").cut, t: now }
        : this.lastCut?.blockId === blockId
          ? null
          : this.lastCut;

    this.lastEditAt = now;
    if (next) {
      // Typing in a block puts the cursor there even if no selection event arrived.
      this.cursorBlock = blockId;
      this.parkedSince = now;
    }
  }

  /** A stall ends with any action: writing or asking. */
  private resume(blockId: string | null, how = "Back at it") {
    const quietMs = this.deps.now() - (this.stuckSince ?? 0);
    this.stuckSince = null;
    this.landmark(
      "resumed",
      `${how} after ${Math.round(quietMs / 1000)}s quiet`,
      blockId,
      sectionOf(this.committed, blockId),
      { quietMs },
    );
  }

  private landmark(
    kind: LandmarkKind,
    label: string,
    blockId: string | null,
    section: string | null,
    extra: { since?: number; quietMs?: number } = {},
  ) {
    this.emit("landmark", { kind, label, blockId, section, ...extra });
  }

  private emit<K extends TraceKind>(kind: K, payload: TracePayloads[K], at?: number): number {
    const t = at ?? this.deps.now();
    const seq = this.deps.emit(kind, payload, t);
    this.log.push({ seq, t, kind, payload } as TraceEvent);
    return seq;
  }
}
