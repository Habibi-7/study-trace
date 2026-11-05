import {
  clip,
  formatClock,
  lookingAt,
  notesAt,
  type Seq,
  sectionName,
  storyUntil,
  stuckSpans,
  type TraceView,
  topicAt,
} from "./read";
import type { ActPayload } from "./types";

/**
 * ContextPack — the read path (study-trace.md §5). What an LLM gets instead of
 * the raw log: one markdown block with stable headings, ~300–2k tokens, ≤2
 * sketch crops, plus the same facts as JSON. Pure — runs in the editor (a tutor)
 * and on the server (agents via /api/goals/[goalId]/trace/pack).
 */

export const PACK_RECENT_ACTS = 12;
export const PACK_MAX_IMAGES = 2;

export type PackSection = {
  name: string;
  edits: number;
  strokes: number;
  erases: number;
  /** Their latest words there (we own the text — no OCR). */
  latest: string[];
};

export type PackImage = { label: string; dataUrl: string };

export type ContextPack = {
  text: string;
  images: PackImage[];
  data: {
    at: number;
    elapsedMs: number;
    goal: string | null;
    topic: string | null;
    arc: string;
    now: {
      section: string | null;
      lookingForMs: number | null;
      lastActAgoMs: number | null;
      lastAct: string | null;
      stuckNow: boolean;
    };
    struggles: {
      at: number;
      kind: "stuck" | "big_erase" | "rewrite";
      section: string;
      detail: string;
    }[];
    sections: PackSection[];
    recentActs: { at: number; who: string; section: string; summary: string }[];
    checks: { at: number; label: string }[];
    asks: { at: number; section: string; text: string }[];
  };
};

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function buildContextPack(
  view: TraceView,
  opts: { at?: number; goal?: string | null; topic?: string | null } = {},
): ContextPack {
  const at = opts.at ?? view.end;
  const rel = (t: number) => formatClock(t - view.start);
  const blocks = notesAt(view, at);
  const name = (section: string | null) => sectionName(blocks, section);

  const acts = view.acts.filter((a) => a.t <= at);
  const lastAct: Seq<ActPayload> | undefined = acts.filter((a) => a.who === "learner").at(-1);
  const landmarks = view.landmarks.filter((l) => l.t <= at);
  const dwell = lookingAt(view, at);
  const looking = dwell && at <= dwell.to + 2000 ? dwell : null;
  const stuckNow =
    [...landmarks].reverse().find((l) => l.kind === "stuck" || l.kind === "resumed")?.kind ===
    "stuck";

  // Q3 — where it was hard, with what followed.
  const struggles: ContextPack["data"]["struggles"] = [
    ...stuckSpans(landmarks).map(({ at: l, end }) => ({
      at: l.t,
      kind: "stuck" as const,
      section: name(l.section),
      // "Asked for help after 54s quiet" → "cursor parked 54s, then asked for help"
      detail: end
        ? `cursor parked ${Math.round((end.quietMs ?? 0) / 1000)}s, then ${lowerFirst(end.label.split(" after ")[0] ?? end.label)}`
        : `cursor parked since ${rel(l.since ?? l.t)} — not resumed`,
    })),
    ...landmarks
      .filter((l) => l.kind === "big_erase")
      .map((l) => {
        const fix = landmarks.find((m) => m.kind === "self_correction" && m.t > l.t);
        return {
          at: l.t,
          kind: "big_erase" as const,
          section: name(l.section),
          detail: `${lowerFirst(l.label)}${fix ? `; rewrote at ${rel(fix.t)}` : "; not rewritten yet"}`,
        };
      }),
    // Rewrites done in one go ("Rewrote “40” as “32”") — a change of mind with no erase to point at.
    ...landmarks
      .filter((l) => l.kind === "self_correction" && l.label.startsWith("Rewrote “"))
      .map((l) => ({
        at: l.t,
        kind: "rewrite" as const,
        section: name(l.section),
        detail: lowerFirst(l.label),
      })),
  ].sort((a, b) => a.at - b.at);

  // Sections they actually worked in, in reading order.
  const tally = new Map<string | null, PackSection>();
  for (const act of acts) {
    if (act.who !== "learner") continue;
    const s = tally.get(act.section) ?? {
      name: name(act.section),
      edits: 0,
      strokes: 0,
      erases: 0,
      latest: [],
    };
    if (act.op === "stroke") s.strokes++;
    else if (act.op === "erase" || act.op === "delete") s.erases++;
    else s.edits++;
    const words = act.block?.text.trim();
    if (words && act.block?.type !== "sketch") {
      s.latest = [...s.latest.filter((w) => w !== clip(words, 120)), clip(words, 120)].slice(-2);
    }
    tally.set(act.section, s);
  }
  const sections = [...tally.values()];

  // A lesson lands as many blocks at once: one line, so the learner's own acts stay visible.
  // One line per run: a lesson's blocks placed at once, or a stretch of typing in one block
  // (people pause mid-sentence; a tutor remembers the sentence, not the fragments).
  const runs: { first: Seq<ActPayload>; last: Seq<ActPayload>; count: number }[] = [];
  for (const act of acts) {
    const run = runs.at(-1);
    const sameTutorBurst =
      run && act.who === "tutor" && run.last.who === "tutor" && run.last.t === act.t;
    const sameTyping =
      run &&
      act.who === "learner" &&
      run.last.who === "learner" &&
      act.blockId === run.last.blockId &&
      act.op === "edit" &&
      (run.last.op === "edit" || run.last.op === "create") &&
      !act.cut &&
      !run.last.cut &&
      act.t - run.last.t < 60_000;
    if (run && (sameTutorBurst || sameTyping)) {
      run.last = act;
      run.count++;
    } else {
      runs.push({ first: act, last: act, count: 1 });
    }
  }
  const recentActs = runs.slice(-PACK_RECENT_ACTS).map(({ first, last, count }) => {
    let summary = last.summary;
    if (count > 1 && first.who === "tutor") summary = `placed a lesson (${count} blocks)`;
    else if (count > 1) {
      const before = first.before ?? "";
      const after = last.block?.text ?? "";
      summary = `typed “${clip(after.startsWith(before) ? after.slice(before.length) : after, 60)}”`;
    }
    return { at: first.t, who: first.who, section: name(first.section), summary };
  });
  const checks = landmarks
    .filter((l) => l.kind === "checked")
    .map((l) => ({ at: l.t, label: l.label }));
  const asks = view.asks
    .filter((a) => a.t <= at)
    .slice(-4)
    .map((a) => ({ at: a.t, section: name(a.section), text: clip(a.text, 200) }));

  // Q4 — sketch receipts: struggle moments first, then newest.
  const kindOf = new Map<number | undefined, string>(landmarks.map((l) => [l.seq, l.kind]));
  const weight = (seq: number | undefined) =>
    ["stuck", "big_erase"].includes(kindOf.get(seq) ?? "") ? 1 : 0;
  const images = view.evidence
    .filter((e) => e.t <= at)
    .sort((a, b) => weight(b.landmarkSeq) - weight(a.landmarkSeq) || b.t - a.t)
    .slice(0, PACK_MAX_IMAGES)
    .map((e, i) => ({
      label: `sketch-${i + 1}: ${(kindOf.get(e.landmarkSeq) ?? "crop").replace("_", " ")} at ${rel(e.t)} in ${name(lastSectionOf(view, e.blockId, e.t))}`,
      dataUrl: e.image,
    }));

  const nowSection = looking?.section ?? lastAct?.section ?? null;
  const data: ContextPack["data"] = {
    at,
    elapsedMs: at - view.start,
    goal: opts.goal ?? null,
    topic: opts.topic ?? topicAt(view, at),
    arc: storyUntil(view, at),
    now: {
      section: lastAct || looking ? name(nowSection) : null,
      lookingForMs: looking ? at - looking.from : null,
      lastActAgoMs: lastAct ? at - lastAct.t : null,
      lastAct: lastAct?.summary ?? null,
      stuckNow,
    },
    struggles,
    sections,
    recentActs,
    checks,
    asks,
  };

  const right = lastAct
    ? `${looking ? `looking at ${data.now.section} for ${Math.round((at - looking.from) / 1000)}s` : `last worked in ${data.now.section}`} · last edit ${formatClock(at - lastAct.t)} ago: ${lastAct.summary}${stuckNow ? " · STUCK (cursor parked)" : ""}`
    : "nothing written yet";

  const lines = [
    "## Study session (observed, not graded)",
    `goal: ${data.goal ?? "—"} · topic: ${data.topic ?? "none picked"} · ${formatClock(data.elapsedMs)} into this sitting`,
    `arc: ${data.arc}`,
    "",
    "### Right now",
    right,
    "",
    "### Where it was hard",
    ...(struggles.length > 0
      ? struggles.map((s) => `- ${rel(s.at)} ${s.section}: ${s.detail}`)
      : ["- no stalls or big erases"]),
    "",
    "### Sections they worked in (by heading)",
    ...(sections.length > 0
      ? sections.map(
          (s) =>
            `- ${s.name}: ${s.edits} edit(s)${s.strokes ? `, ${s.strokes} sketch stroke group(s)` : ""}${s.erases ? `, ${s.erases} erase(s)` : ""}${s.latest.length ? `; latest: ${s.latest.map((w) => `“${w}”`).join(" / ")}` : ""}`,
        )
      : ["- none yet"]),
    "",
    `### Last ${recentActs.length} acts (oldest first)`,
    ...recentActs.map(
      (a) => `- ${rel(a.at)} ${a.who === "learner" ? "" : `[${a.who}] `}${a.section}: ${a.summary}`,
    ),
  ];
  if (checks.length > 0) {
    lines.push("", "### Checks they took", ...checks.map((c) => `- ${rel(c.at)} ${c.label}`));
  }
  if (asks.length > 0) {
    lines.push(
      "",
      "### Questions they asked",
      ...asks.map((a) => `- ${rel(a.at)} at ${a.section}: “${a.text}”`),
    );
  }
  if (images.length > 0) {
    lines.push(
      "",
      "### Sketch crops attached (handwriting lives only in these)",
      ...images.map((i) => `- ${i.label}`),
    );
  }
  lines.push(
    "",
    "Note: this is a sensor log. It says what happened, not what they know — don't treat it as mastery.",
  );

  return { text: lines.join("\n"), images, data };
}

/** The section a block was last seen in, as of `t`. */
function lastSectionOf(view: TraceView, blockId: string, t: number): string | null {
  let section: string | null = null;
  for (const act of view.acts) {
    if (act.t > t) break;
    if (act.blockId === blockId) section = act.section;
  }
  return section;
}
