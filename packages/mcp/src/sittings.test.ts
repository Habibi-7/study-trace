import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Block, notesAt, Recorder, toMarkdown } from "@study-trace/core";
import { describe, expect, it } from "vitest";
import { listLine, loadSittings, moment, pick, recap } from "./sittings";

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
  now += 47_000;
  recorder.ask("is my network address right?");
  now += 20_000;
  recorder.typing();
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

  it("lists a sitting in one line and recaps it as plain frames", async () => {
    const sittings = await loadSittings(await fixture());
    expect(listLine(sittings[0] as never)).toContain(
      "CS-410 Midterm Practice.md · 2 edits · 1 questions · longest pause 47s",
    );
    const text = recap(sittings, { note: "cs-410" });
    expect(text).toContain("CS-410 Midterm Practice.md");
    expect(text).toContain("session obsidian-test");
    const frames = text.split("\n").filter((line) => /^\[\d/.test(line));
    expect(frames).toEqual([
      '[0:00] opened the note (get_notes_at at "0:00" shows it as it was)',
      "[0:05] “Classless IPv4 (CIDR)” · wrote “203.0.113.45/28 network is 203.0.113.40 because 45 rounds down to 40.”",
      "[0:05–0:52] 47s without typing · cursor on “203.0.113.45/28 network is 203.0.113.40 because 45 rounds down to 40.” 47s",
      "[0:52] marked a question: “is my network address right?”",
      "[0:52–1:12] 20s without typing · cursor on “203.0.113.45/28 network is 203.0.113.40 because 45 rounds down to 40.” 20s",
      "[1:12] “203.0.113.45/28 network is 203.0.113.40 because 45 rounds down to 40.” → “203.0.113.45/28 network is 203.0.113.32: blocks start at multiples of 16.”",
      "[1:12] end",
    ]);
  });

  it("returns nothing for an empty or missing directory", async () => {
    expect(await loadSittings(join(tmpdir(), "does-not-exist-study-trace"))).toEqual([]);
  });
});
