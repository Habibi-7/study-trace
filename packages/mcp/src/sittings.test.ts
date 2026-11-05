import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Block, notesAt, Recorder, STUCK_MS, toMarkdown } from "@study-trace/core";
import { describe, expect, it } from "vitest";
import { loadSittings, moment, pick, recap } from "./sittings";

/** A sitting as the Obsidian plugin would record it, written as JSONL. */
async function fixture(): Promise<string> {
  let now = Date.parse("2026-10-27T18:00:00Z");
  const lines: string[] = [];
  let seq = 0;
  const recorder = new Recorder({
    now: () => now,
    emit: (kind, payload, t) => {
      lines.push(JSON.stringify({ seq: seq++, t: t ?? now, kind, payload }));
      return seq - 1;
    },
    isVisible: () => true,
  });
  const h = (id: string, text: string): Block => ({ id, type: "heading", level: 2, text });
  const li = (id: string, text: string): Block => ({ id, type: "bulletListItem", text });
  const notes = (answer: string) => [h("b1", "Classless IPv4 (CIDR)"), li("b2", answer)];

  recorder.start(notes(""), "CS-410 Midterm Practice.md");
  now += 5000;
  recorder.change(notes("203.0.113.45/28 network is 203.0.113.40 because 45 rounds down to 40."));
  recorder.commit();
  recorder.setCursor("b2");
  now += STUCK_MS + 2000;
  recorder.tick();
  recorder.ask("is my network address right?");
  now += 20_000;
  recorder.change(
    notes("203.0.113.45/28 network is 203.0.113.32: blocks start at multiples of 16."),
  );
  recorder.commit();
  recorder.stop();

  const dir = await mkdtemp(join(tmpdir(), "study-trace-"));
  await writeFile(join(dir, "obsidian-test.jsonl"), `${lines.join("\n")}\n{"torn`);
  return dir;
}

describe("sittings from JSONL", () => {
  it("loads a sitting, survives a torn last line, and replays the note at a moment", async () => {
    const dir = await fixture();
    const sittings = await loadSittings(dir);
    expect(sittings).toHaveLength(1);
    const s = pick(sittings, undefined, "cs-410");
    expect(s).toMatchObject({
      sessionId: "obsidian-test",
      note: "CS-410 Midterm Practice.md",
      edits: 2,
    });
    if (!s) return;

    // "m:ss" into the sitting: before the rewrite, the wrong answer is what's there.
    expect(toMarkdown(notesAt(s.view, moment(s, "0:10")))).toContain("203.0.113.40");
    expect(toMarkdown(notesAt(s.view, moment(s)))).toContain("203.0.113.32");
  });

  it("recaps a sitting's hard moments and questions in time order, with times", async () => {
    const text = recap(await loadSittings(await fixture()), { note: "cs-410" });
    expect(text).toContain("CS-410 Midterm Practice.md (obsidian-test)");
    const timeline = text.split("\n").filter((line) => line.startsWith("- "));
    expect(timeline).toEqual([
      "- 0:52 stuck · “Classless IPv4 (CIDR)” — cursor parked 47s, then asked for help",
      "- 0:52 asked · “Classless IPv4 (CIDR)” — “is my network address right?”",
      "- 1:12 rewrote · “Classless IPv4 (CIDR)” — rewrote “40 because 45 rounds do…” as “32: blocks start at mul…”",
    ]);
  });

  it("returns nothing for an empty or missing directory", async () => {
    expect(await loadSittings(join(tmpdir(), "does-not-exist-study-trace"))).toEqual([]);
  });
});
