import type { ActPayload, AskPayload, Block, Placed, QuietPayload, TraceEvent } from "./types";

/**
 * Read side: a sitting back from its events — the note at any moment `t`, and the whole
 * sitting as plain frames. Pure; runs wherever a sitting is read.
 */

export type Seq<T> = T & { seq: number; t: number };

export type TraceView = {
  start: number;
  end: number;
  /** The note's path. */
  topic: string | null;
  baseline: Placed[];
  acts: Seq<ActPayload>[];
  quiets: Seq<QuietPayload>[];
  asks: Seq<AskPayload>[];
};

export function readTrace(events: TraceEvent[]): TraceView {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const view: TraceView = {
    start: sorted[0]?.t ?? 0,
    end: sorted.at(-1)?.t ?? 0,
    topic: null,
    baseline: [],
    acts: [],
    quiets: [],
    asks: [],
  };
  for (const event of sorted) {
    const at = { seq: event.seq, t: event.t };
    switch (event.kind) {
      case "session":
        if (event.payload.op === "open") {
          view.topic = event.payload.topic;
          view.baseline = event.payload.baseline ?? [];
        }
        break;
      case "act":
        view.acts.push({ ...event.payload, ...at });
        break;
      case "quiet":
        view.quiets.push({ ...event.payload, ...at });
        break;
      case "ask":
        view.asks.push({ ...event.payload, ...at });
        break;
    }
  }
  return view;
}

/** The notes exactly as they stood at `t`, in reading order. */
export function notesAt(view: TraceView, t: number): Placed[] {
  const order = view.baseline.map((block) => ({ ...block }));
  const indexOf = (id: string | null) => order.findIndex((b) => b.id === id);
  for (const act of view.acts) {
    if (act.t > t) break;
    const was = indexOf(act.blockId);
    if (was >= 0) order.splice(was, 1);
    if (!act.block) continue;
    const anchor = indexOf(act.block.after);
    // Anchor gone (deleted in the same pause): keep its old spot, else the end.
    const at =
      act.block.after === null ? 0 : anchor >= 0 ? anchor + 1 : was >= 0 ? was : order.length;
    order.splice(at, 0, act.block);
  }
  return order;
}

export function placed(blocks: Block[]): Placed[] {
  return blocks.map((block, i) => ({ ...block, after: blocks[i - 1]?.id ?? null }));
}

// --- sections: "where", by heading -------------------------------------------

/** The heading a block sits under (its own id for a heading); null above the first heading. */
export function sectionOf(blocks: Block[], blockId: string | null): string | null {
  if (!blockId) return null;
  let section: string | null = null;
  for (const block of blocks) {
    if (block.type === "heading") section = block.id;
    if (block.id === blockId) return section;
  }
  return null;
}

/** How a tutor would say it: “Chain rule”, "the top of the page", or gone. */
export function sectionName(blocks: Block[], section: string | null): string {
  if (section === null) return "the top of the page";
  const heading = blocks.find((b) => b.id === section);
  if (!heading) return "a section since removed";
  // Headings from markdown carry formatting (`code`, **bold**, [[links]]); a tutor says the words.
  const words = heading.text
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]*)\*\*|__([^_]*)__/g, "$1$2")
    .replace(
      /\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g,
      (_, page: string, alias?: string) => alias ?? page,
    )
    .trim();
  return `“${words || "Untitled heading"}”`;
}

/** Characters cut and typed between two versions of one block's text, and where. */
export function textDelta(
  before: string,
  after: string,
): { cut: string; typed: string; at: number } {
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
    at: start,
  };
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function clip(text: string, n = 48): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat;
}

const PREFIX: Record<string, string> = {
  bulletListItem: "- ",
  numberedListItem: "1. ",
};

/** Markdown of some blocks, for agents reading over MCP. */
export function toMarkdown(blocks: Block[]): string {
  return blocks
    .map((b) => {
      if (b.type === "heading") return `${"#".repeat(b.level ?? 2)} ${b.text}`;
      if (b.type === "math") return `$$ ${b.text} $$`;
      if (b.type === "checkListItem") return `- [${b.checked ? "x" : " "}] ${b.text}`;
      return `${PREFIX[b.type] ?? ""}${b.text}`;
    })
    .join("\n");
}

// --- timeline: the sitting as frames, for an LLM to read -------------------------

const LONG_BLOCK = 160;
/** Cutting this much while typing is a change of mind, not a typo: it starts a new frame. */
const CHANGE_CUT = 4;
const flat = (text: string) => text.replace(/\n/g, " ↵ ");
const quote = (text: string, n = 400) => `“${clip(flat(text), n)}”`;

/** One block's text going from `before` to `after`, said plainly. */
function change(before: string, after: string): string {
  if (!before.trim()) return `wrote ${quote(after)}`;
  if (!after.trim()) return `cleared ${quote(before)}`;
  const { cut, typed, at } = textDelta(before, after);
  if (!cut.trim() && !typed.trim()) return "changed spacing";
  if (before.length <= LONG_BLOCK && after.length <= LONG_BLOCK) {
    return `${quote(before)} → ${quote(after)}`;
  }
  // Widen to whole words: "47.254" → "47.255", not "4" → "5".
  let start = at;
  while (start > 0 && !/\s/.test(before[start - 1] ?? "")) start--;
  let end = at + cut.length;
  while (end < before.length && !/\s/.test(before[end] ?? "")) end++;
  const tail = before.length - end;
  const was = before.slice(start, end);
  const now = after.slice(start, after.length - tail);
  const lead = before.slice(Math.max(0, start - 30), start);
  const ctx = start > 30 ? `…${lead.replace(/^\S*\s/, "")}` : lead;
  if (!cut) return `typed ${quote(typed)} after ${quote(ctx + before.slice(start, at))}`;
  return `${quote(ctx + was)} → ${quote(ctx + now)}`;
}

type Frame = { seq: number; t: number; until?: number; section: string | null; text: string };

/**
 * The sitting as a list of plain frames — what changed, where the cursor sat while nothing
 * did, what they asked — each stamped `m:ss` into the sitting. No verdicts: the reader
 * decides what a 60-second pause over a wrong answer means.
 */
export function timeline(view: TraceView): string[] {
  const frames: Frame[] = [];
  const events = [
    ...view.acts.map((a) => ({ ...a, kind: "act" as const })),
    ...view.quiets.map((q) => ({ ...q, kind: "quiet" as const })),
    ...view.asks.map((a) => ({ ...a, kind: "ask" as const })),
  ].sort((a, b) => a.seq - b.seq);

  // Typing in one block across several pauses is one frame: first text → last text —
  // unless they cut a word or more, which shows as its own before → after.
  type Run = { blockId: string; before: string; after: string; first: Seq<ActPayload> };
  let run = null as Run | null;
  const flush = () => {
    if (!run) return;
    frames.push({
      seq: run.first.seq,
      t: run.first.t,
      section: run.first.section,
      text: change(run.before, run.after),
    });
    run = null;
  };

  for (const e of events) {
    if (e.kind === "act") {
      const text = e.block?.text;
      const editing = (e.op === "create" || e.op === "edit") && text !== undefined;
      const sameText = e.op === "edit" && (e.before ?? text) === text;
      if (editing && !sameText) {
        if (run?.blockId === e.blockId && (e.cut ?? 0) < CHANGE_CUT) {
          run.after = text;
          continue;
        }
        flush();
        run = {
          blockId: e.blockId,
          before: e.op === "create" ? "" : (e.before ?? ""),
          after: text,
          first: e,
        };
        continue;
      }
      flush();
      const what =
        e.op === "delete"
          ? `deleted the line ${quote(e.before ?? "")}`
          : e.op === "move"
            ? `moved ${quote(text ?? "")}`
            : (e.summary ?? "changed a line");
      frames.push({ seq: e.seq, t: e.t, section: e.section, text: what });
    } else if (e.kind === "quiet") {
      flush();
      // The note as it stood while they sat there — before the edit that ended the stretch.
      const blocks = notesAt(view, e.t - 1);
      const textOf = (id: string | null) => blocks.find((b) => b.id === id)?.text;
      const spots = e.spots
        .slice(0, 3)
        .map((s) => {
          const at = textOf(s.blockId);
          return `${at !== undefined ? quote(at, 70) : "no line"} ${Math.round(s.ms / 1000)}s`;
        })
        .join(", then ");
      const parts = [
        `${Math.round(e.ms / 1000)}s without typing`,
        spots ? `cursor on ${spots}` : "cursor not in the note",
        e.awayMs >= 1000 ? `away from Obsidian ${Math.round(e.awayMs / 1000)}s` : null,
        e.view
          ? `on screen: ${quote(textOf(e.view.first) ?? "?", 30)} to ${quote(textOf(e.view.last) ?? "?", 30)}`
          : null,
      ];
      frames.push({
        seq: e.seq,
        t: e.from,
        until: e.t,
        section: e.spots[0]?.section ?? null,
        text: parts.filter(Boolean).join(" · "),
      });
    } else {
      flush();
      frames.push({
        seq: e.seq,
        t: e.t,
        section: e.section,
        text: `marked a question: ${quote(e.text)}`,
      });
    }
  }
  flush();

  const end = notesAt(view, view.end);
  let lastSection: string | null | undefined;
  const clock = (t: number) => formatClock(t - view.start);
  return frames.map((f) => {
    const when = f.until !== undefined ? `${clock(f.t)}–${clock(f.until)}` : clock(f.t);
    const where = f.section === lastSection ? "" : `${sectionName(end, f.section)} · `;
    lastSection = f.section;
    return `[${when}] ${where}${f.text}`;
  });
}
