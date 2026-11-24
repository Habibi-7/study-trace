import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  formatClock,
  readTrace,
  type TraceEvent,
  type TraceView,
  timeline,
} from "@study-trace/core";

/** One recorded sitting: a JSONL file of trace events, as the Obsidian plugin writes them. */
export type Sitting = {
  sessionId: string;
  /** What they had open (the note's path, for Obsidian). */
  note: string | null;
  startedAt: number;
  endedAt: number;
  edits: number;
  questions: number;
  /** The longest stretch without typing, in ms. */
  longestQuiet: number;
  view: TraceView;
};

/** Every sitting in a trace directory, newest first. Malformed lines are skipped, not fatal. */
export async function loadSittings(dir: string): Promise<Sitting[]> {
  const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith(".jsonl"));
  const sittings = await Promise.all(
    files.map(async (file) => {
      const events: TraceEvent[] = [];
      for (const line of (await readFile(join(dir, file), "utf8")).split("\n")) {
        if (!line.trim()) continue;
        try {
          events.push(JSON.parse(line) as TraceEvent);
        } catch {
          // A torn last line from a crash mid-write; the rest is still good.
        }
      }
      const view = readTrace(events);
      return {
        sessionId: file.replace(/\.jsonl$/, ""),
        note: view.topic,
        startedAt: view.start,
        endedAt: view.end,
        edits: view.acts.length,
        questions: view.asks.length,
        longestQuiet: Math.max(0, ...view.quiets.map((q) => q.ms)),
        view,
      } satisfies Sitting;
    }),
  );
  return sittings
    .filter((s) => s.view.acts.length > 0 || s.view.asks.length > 0)
    .sort((a, b) => b.endedAt - a.endedAt);
}

/** A named sitting, else the latest one (optionally for a given note). */
export function pick(sittings: Sitting[], session?: string, note?: string): Sitting | undefined {
  if (session) return sittings.find((s) => s.sessionId === session);
  return note
    ? sittings.find((s) => s.note?.toLowerCase().includes(note.toLowerCase()))
    : sittings[0];
}

/** `at` as an ISO time, epoch ms, or "m:ss" into the sitting; default = the end. */
export function moment(sitting: Sitting, at?: string): number {
  if (!at) return sitting.endedAt;
  const clock = /^(\d+):(\d{2})$/.exec(at.trim());
  if (clock) return sitting.startedAt + (Number(clock[1]) * 60 + Number(clock[2])) * 1000;
  const n = Number(at);
  if (Number.isFinite(n)) return n;
  const iso = Date.parse(at);
  return Number.isFinite(iso) ? iso : sitting.endedAt;
}

const when = (t: number) =>
  new Date(t).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** One line per sitting, for picking one. */
export function listLine(s: Sitting): string {
  return [
    s.sessionId,
    when(s.startedAt),
    formatClock(s.endedAt - s.startedAt),
    s.note ?? "?",
    `${s.edits} edits`,
    `${s.questions} questions`,
    `longest pause ${Math.round(s.longestQuiet / 1000)}s`,
  ].join(" · ");
}

/** A whole sitting as frames, with a header that says which one it is. */
export function sittingText(s: Sitting): string {
  return [
    `## ${s.note ?? "?"} · ${when(s.startedAt)} · ${formatClock(s.endedAt - s.startedAt)} · session ${s.sessionId}`,
    `[0:00] opened the note (get_notes_at at "0:00" shows it as it was)`,
    ...timeline(s.view),
    `[${formatClock(s.endedAt - s.startedAt)}] end`,
  ].join("\n");
}

/** Several sittings, oldest first — the arc of someone's studying, not one session. */
export function recap(sittings: Sitting[], opts: { note?: string; limit?: number } = {}): string {
  const chosen = sittings
    .filter((s) => !opts.note || s.note?.toLowerCase().includes(opts.note.toLowerCase()))
    .slice(0, opts.limit ?? 3)
    .reverse();
  if (chosen.length === 0) return "No sittings match.";
  return chosen.map(sittingText).join("\n\n");
}
