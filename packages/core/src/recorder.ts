import { clip, placed, sectionOf, textDelta } from "./read";
import type {
  ActPayload,
  Block,
  QuietPayload,
  TraceEvent,
  TraceKind,
  TracePayloads,
} from "./types";

/**
 * The tutor's eyes on the notes, as plain frames: an act per block on each typing pause,
 * a quiet frame for every stretch without typing, an ask when they mark a question.
 * It records what happened and leaves the reading of it to whoever reads.
 *
 * Pure — no DOM, no timers. The editor binding feeds it changes, keystrokes, cursor
 * moves, the visible range and window focus, and calls `commit()` on the pause.
 */

/** Acts commit when typing pauses — not per keystroke. */
export const TYPING_IDLE_MS = 800;
/** No typing for this long becomes a quiet frame. */
export const QUIET_MS = 10_000;

export type RecorderDeps = {
  now: () => number;
  /** Persist one event; returns its seq. */
  emit: <K extends TraceKind>(kind: K, payload: TracePayloads[K], t?: number) => number;
  isVisible: () => boolean;
};

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
  /** Everything emitted this sitting. */
  readonly log: TraceEvent[] = [];

  private committed: Block[] = [];
  private latest: Block[] = [];
  private started = false;
  private stopped = false;

  private cursorBlock: string | null = null;
  private range: QuietPayload["view"] = null;
  /** Since the last keystroke, act or ask. */
  private quietSince = 0;
  /** Where the cursor has sat since then; the open spot is `spot`. */
  private spots: { blockId: string | null; away: boolean; ms: number }[] = [];
  private spot = { blockId: null as string | null, away: false, from: 0 };

  constructor(private readonly deps: RecorderDeps) {}

  start(blocks: Block[], topic: string | null) {
    if (this.started) return;
    this.started = true;
    this.committed = this.latest = blocks;
    const now = this.deps.now();
    this.quietSince = now;
    this.spot = { blockId: null, away: !this.deps.isVisible(), from: now };
    this.emit("session", { op: "open", topic, baseline: placed(blocks) });
  }

  stop() {
    if (!this.started || this.stopped) return;
    this.commit();
    this.endQuiet();
    this.stopped = true;
    this.emit("session", { op: "close", topic: null });
  }

  /** The notes changed. The binding calls `commit()` after the typing pause. */
  change(blocks: Block[]) {
    if (this.live) this.latest = blocks;
  }

  /** A keystroke: whatever quiet came before it is over. */
  typing() {
    if (this.live) this.endQuiet();
  }

  /** Diff what was last committed against now: one act per touched block. */
  commit() {
    if (!this.live || this.latest === this.committed) return;
    // A change with no keystroke first (a checkbox click) also ends the quiet.
    this.endQuiet();
    const before = this.committed;
    const after = this.latest;
    this.committed = after;
    const prevById = new Map(before.map((b) => [b.id, b]));
    const moved = movedBlocks(before, after);

    after.forEach((block, i) => {
      const prev = prevById.get(block.id) ?? null;
      if (prev && same(prev, block) && !moved.has(block.id)) return;
      const act = this.describe(prev, block);
      this.record({ ...act, block: { ...block, after: after[i - 1]?.id ?? null } }, block);
    });

    const kept = new Set(after.map((b) => b.id));
    for (const block of before) {
      if (kept.has(block.id)) continue;
      this.record(
        {
          op: "delete",
          blockId: block.id,
          section: sectionOf(before, block.id),
          ...(block.text ? { before: block.text, cut: block.text.length } : {}),
        },
        null,
      );
    }
  }

  /** Cursor moved. Only block changes matter — arrowing inside a block is the same spot. */
  setCursor(blockId: string | null) {
    if (!this.live || blockId === this.cursorBlock) return;
    this.cursorBlock = blockId;
    this.moveSpot(blockId, this.spot.away);
  }

  /** The blocks at the top and bottom of the screen. */
  setRange(view: QuietPayload["view"]) {
    if (this.live) this.range = view;
  }

  /** Window lost focus: time from here on is time away. */
  hidden() {
    this.commit();
    if (this.live && !this.spot.away) this.moveSpot(this.cursorBlock, true);
  }

  visible() {
    if (this.live && this.spot.away) this.moveSpot(this.cursorBlock, false);
  }

  /** They marked a question at the cursor. */
  ask(text: string) {
    if (!this.live) return;
    this.commit();
    this.endQuiet();
    const blockId = this.committed.some((b) => b.id === this.cursorBlock) ? this.cursorBlock : null;
    this.emit("ask", { text, blockId, section: sectionOf(this.committed, blockId) });
  }

  private get live() {
    return this.started && !this.stopped;
  }

  /** What kind of change; text changes carry the text before (the block carries after). */
  private describe(prev: Block | null, next: Block): ActPayload {
    const base = { blockId: next.id, section: sectionOf(this.committed, next.id) };
    if (prev === null) {
      return { ...base, op: "create", ...(next.text ? { typed: next.text.length } : {}) };
    }
    if (prev.checked !== next.checked && prev.text === next.text) {
      return {
        ...base,
        op: "edit",
        summary: `${next.checked ? "ticked" : "unticked"} “${clip(next.text, 80)}”`,
      };
    }
    const retyped = prev.type !== next.type || prev.level !== next.level;
    if (prev.text !== next.text && !(retyped && prev.text.trim() === next.text.trim())) {
      const { cut, typed } = textDelta(prev.text, next.text);
      return { ...base, op: "edit", before: prev.text, cut: cut.length, typed: typed.length };
    }
    if (retyped) {
      return {
        ...base,
        op: "edit",
        summary: `made “${clip(next.text || next.type, 80)}” a ${next.type}`,
      };
    }
    return { ...base, op: "move" };
  }

  // --- frames ------------------------------------------------------------------

  private record(act: ActPayload, next: Block | null) {
    this.emit("act", act);
    // Typing in a block puts the cursor there even if no selection event arrived.
    if (next) this.setCursor(next.id);
  }

  // --- quiet -------------------------------------------------------------------

  private moveSpot(blockId: string | null, away: boolean) {
    const now = this.deps.now();
    this.spots.push({ blockId: this.spot.blockId, away: this.spot.away, ms: now - this.spot.from });
    this.spot = { blockId, away, from: now };
  }

  /** Typing (or the end) after a long enough stretch without it: write the stretch down. */
  private endQuiet() {
    const now = this.deps.now();
    const from = this.quietSince;
    if (now - from >= QUIET_MS) {
      this.moveSpot(this.spot.blockId, this.spot.away);
      const spots: QuietPayload["spots"] = [];
      let awayMs = 0;
      for (const { blockId, away, ms } of this.spots) {
        if (away) awayMs += ms;
        else if (ms >= 1000) {
          const last = spots.at(-1);
          if (last && last.blockId === blockId) last.ms += ms;
          else spots.push({ blockId, section: sectionOf(this.committed, blockId), ms });
        }
      }
      this.emit("quiet", { from, ms: now - from, spots, awayMs, view: this.range }, now);
    }
    this.quietSince = now;
    this.spots = [];
    this.spot = { ...this.spot, from: now };
  }

  private emit<K extends TraceKind>(kind: K, payload: TracePayloads[K], at?: number): number {
    const t = at ?? this.deps.now();
    const seq = this.deps.emit(kind, payload, t);
    this.log.push({ seq, t, kind, payload } as TraceEvent);
    return seq;
  }
}
