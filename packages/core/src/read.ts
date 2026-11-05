import type {
  ActPayload,
  AskPayload,
  Block,
  LandmarkKind,
  LandmarkPayload,
  Placed,
  TraceEvent,
} from "./types";

/**
 * Read side: a sitting as a tutor would read it back, at any moment `t`.
 * Pure — runs in the editor plugin, in the MCP server, and anywhere a sitting is read.
 */

export type Seq<T> = T & { seq: number; t: number };

export type TraceView = {
  start: number;
  end: number;
  /** The note's path. */
  topic: string | null;
  baseline: Placed[];
  acts: Seq<ActPayload>[];
  landmarks: Seq<LandmarkPayload>[];
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
    landmarks: [],
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
      case "landmark":
        view.landmarks.push({ ...event.payload, ...at });
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

const BIT: Record<LandmarkKind, string> = {
  first_attempt: "first words",
  stuck: "stuck",
  resumed: "picked it back up",
  big_erase: "erased",
  self_correction: "rewrote",
  help_ask: "asked",
};

/** The arc, run-length collapsed: "first words → stuck → asked → rewrote". */
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

/** Each stall and the moment it ended (null while still stuck). */
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
