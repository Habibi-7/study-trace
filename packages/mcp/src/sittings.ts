import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildContextPack,
  formatClock,
  readTrace,
  type TraceEvent,
  type TraceView,
} from "@study-trace/core";

/** One recorded sitting: a JSONL file of trace events, as the Obsidian plugin writes them. */
export type Sitting = {
  sessionId: string;
  /** What they had open (the note's path, for Obsidian). */
  note: string | null;
  startedAt: number;
  endedAt: number;
  /** The learner's own edits. */
  edits: number;
  moments: number;
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
        note: view.topics[0]?.topic ?? view.topic,
        startedAt: view.start,
        endedAt: view.end,
        edits: view.acts.filter((a) => a.who === "learner").length,
        moments: view.landmarks.filter((l) => l.kind !== "resumed").length,
        view,
      } satisfies Sitting;
    }),
  );
  return sittings
    .filter((s) => s.view.acts.length > 0 || s.view.landmarks.length > 0)
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

/**
 * Several sittings at once, oldest first — the arc of someone's studying, not one session.
 * Each: when, how long, which note, the arc, where it was hard, what they asked.
 */
export function recap(sittings: Sitting[], opts: { note?: string; limit?: number } = {}): string {
  const chosen = sittings
    .filter((s) => !opts.note || s.note?.toLowerCase().includes(opts.note.toLowerCase()))
    .slice(0, opts.limit ?? 5)
    .reverse();
  if (chosen.length === 0) return "No sittings match.";
  return chosen
    .map((s) => {
      const { data } = buildContextPack(s.view, { topic: s.note });
      const when = new Date(s.startedAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      return [
        `### ${when} · ${formatClock(s.endedAt - s.startedAt)} · ${s.note ?? "?"} (${s.sessionId})`,
        `arc: ${data.arc} · ${s.edits} edits`,
        ...data.struggles.map((x) => `- hard: ${x.section} — ${x.detail}`),
        ...data.asks.map((a) => `- asked at ${a.section}: “${a.text}”`),
        ...data.checks.map((c) => `- check: ${c.label}`),
        data.now.stuckNow ? `- ended stuck in ${data.now.section}` : null,
      ]
        .filter((line) => line !== null)
        .join("\n");
    })
    .join("\n\n");
}
