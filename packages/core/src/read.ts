import type {
  ActPayload,
  AskPayload,
  Block,
  EvidencePayload,
  FocusPayload,
  LandmarkKind,
  LandmarkPayload,
  Placed,
  TraceEvent,
} from "./types";

/**
 * Read side: what a silent tutor could say at any moment `t` of a sitting.
 * Pure — runs in the editor plugin, in the MCP server, and anywhere a sitting is read.
 */

export type Seq<T> = T & { seq: number; t: number };

export type TraceView = {
  start: number;
  end: number;
  /** The topic open at the end; `topics` has every change. */
  topic: string | null;
  topics: { t: number; topic: string | null }[];
  baseline: Placed[];
  acts: Seq<ActPayload>[];
  focus: Seq<FocusPayload>[];
  landmarks: Seq<LandmarkPayload>[];
  evidence: Seq<EvidencePayload>[];
  asks: Seq<AskPayload>[];
};

export function readTrace(events: TraceEvent[]): TraceView {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const view: TraceView = {
    start: sorted[0]?.t ?? 0,
    end: sorted.at(-1)?.t ?? 0,
    topic: null,
    topics: [],
    baseline: [],
    acts: [],
    focus: [],
    landmarks: [],
    evidence: [],
    asks: [],
  };
  for (const event of sorted) {
    const at = { seq: event.seq, t: event.t };
    switch (event.kind) {
      case "session":
        if (event.payload.baseline) view.baseline = event.payload.baseline;
        if (event.payload.op !== "close") {
          view.topic = event.payload.topic;
          view.topics.push({ t: event.t, topic: event.payload.topic });
        }
        break;
      case "act":
        view.acts.push({ ...event.payload, ...at });
        break;
      case "focus":
        view.focus.push({ ...event.payload, ...at });
        view.end = Math.max(view.end, event.payload.to);
        break;
      case "landmark":
        view.landmarks.push({ ...event.payload, ...at });
        break;
      case "evidence":
        view.evidence.push({ ...event.payload, ...at });
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

/** Every block in a section, in order. */
export function sectionBlocks(blocks: Block[], section: string | null): Block[] {
  let current: string | null = null;
  return blocks.filter((block) => {
    if (block.type === "heading") current = block.id;
    return current === section;
  });
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

// --- the moment -------------------------------------------------------------

/** The curriculum topic they had open at `t`. */
export function topicAt(view: TraceView, t: number): string | null {
  return view.topics.filter((x) => x.t <= t).at(-1)?.topic ?? null;
}

/** Where their eyes were at `t`: the dwell covering it, else the last one before. */
export function lookingAt(view: TraceView, t: number): Seq<FocusPayload> | null {
  let last: Seq<FocusPayload> | null = null;
  for (const dwell of view.focus) {
    if (dwell.from > t) break;
    last = dwell;
  }
  return last;
}

const BIT: Record<LandmarkKind, string> = {
  first_attempt: "first words",
  stuck: "stuck",
  resumed: "picked it back up",
  big_erase: "erased",
  self_correction: "rewrote",
  help_ask: "asked",
  taught: "got a lesson",
  checked: "took a check",
};

/** Q5 — the arc, run-length collapsed: "first words → stuck → asked → rewrote". */
export function storyUntil(view: TraceView, t: number): string {
  const bits: string[] = [];
  for (const landmark of view.landmarks) {
    if (landmark.t > t) break;
    const bit = BIT[landmark.kind];
    const last = bits.at(-1);
    if (last?.startsWith(bit)) {
      const n = Number(last.split("×")[1] ?? 1) + 1;
      bits[bits.length - 1] = `${bit} ×${n}`;
    } else {
      bits.push(bit);
    }
  }
  return bits.length > 0 ? bits.join(" → ") : "nothing yet";
}

/** Q3 — each stall and the moment it ended (null while still stuck). */
export function stuckSpans(
  landmarks: Seq<LandmarkPayload>[],
): { at: Seq<LandmarkPayload>; end: Seq<LandmarkPayload> | null }[] {
  const spans: { at: Seq<LandmarkPayload>; end: Seq<LandmarkPayload> | null }[] = [];
  for (const landmark of landmarks) {
    if (landmark.kind === "stuck") spans.push({ at: landmark, end: null });
    const open = spans.at(-1);
    if (landmark.kind === "resumed" && open && open.end === null) open.end = landmark;
  }
  return spans;
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
  checkListItem: "- [ ] ",
};

/** Markdown of some blocks — for tutors, agents, and the MCP server. Math stays as the plain source typed. */
export function toMarkdown(blocks: Block[], cursor: string | null = null): string {
  return blocks
    .map((b) => {
      const here = b.id === cursor ? "   ← cursor" : "";
      if (b.type === "heading") return `${"#".repeat(b.level ?? 2)} ${b.text}${here}`;
      if (b.type === "math") return `$$ ${b.text} $$${here}`;
      if (b.type === "sketch") return `[sketch: ${b.marks ?? 0} marks]${here}`;
      return `${PREFIX[b.type] ?? ""}${b.text}${here}`;
    })
    .join("\n");
}
