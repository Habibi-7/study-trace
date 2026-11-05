import { describe, expect, it } from "vitest";
import { buildContextPack } from "./pack";
import { notesAt, readTrace, sectionName, sectionOf } from "./read";
import { movedBlocks, Recorder, STUCK_MS, textDelta } from "./recorder";
import type { Block, LandmarkPayload, TraceEvent } from "./types";

function harness(blocks: Block[]) {
  let now = 1_000_000;
  let seq = 0;
  let visible = true;
  const crops: string[] = [];
  const core = new Recorder({
    now: () => now,
    emit: () => seq++,
    isVisible: () => visible,
    capture: async (id) => {
      crops.push(id);
      return { image: "data:image/jpeg;base64,AA", w: 10, h: 10 };
    },
  });
  core.start(blocks, { first: 0, last: blocks.length - 1 }, "Derivatives");
  return {
    core,
    crops,
    advance: (ms: number) => {
      now += ms;
    },
    hide: () => {
      visible = false;
    },
    landmarks: () =>
      core.log
        .filter((e): e is TraceEvent<"landmark"> => e.kind === "landmark")
        .map((e) => e.payload as LandmarkPayload),
    kinds: () =>
      core.log
        .filter((e): e is TraceEvent<"landmark"> => e.kind === "landmark")
        .map((e) => e.payload.kind),
  };
}

const h = (id: string, text: string): Block => ({ id, type: "heading", text, level: 2 });
const p = (id: string, text: string): Block => ({ id, type: "paragraph", text });
const sketch = (id: string, marks: number): Block => ({ id, type: "sketch", text: "", marks });

const LONG = "The derivative of x squared is 2x because the slope grows linearly";

describe("sections", () => {
  it("names sections by heading and keeps an untitled top", () => {
    const blocks = [p("a", "intro"), h("h1", "Chain rule"), p("b", "f(g(x))")];
    expect(sectionOf(blocks, "a")).toBeNull();
    expect(sectionOf(blocks, "b")).toBe("h1");
    expect(sectionOf(blocks, "h1")).toBe("h1");
    expect(sectionName(blocks, "h1")).toBe("“Chain rule”");
    expect(sectionName(blocks, null)).toBe("the top of the page");
    expect(sectionName(blocks, "gone")).toBe("a section since removed");
    const md = [h("m", "`ip neigh` and **ARP** · [[Networks Map|map]]")];
    expect(sectionName(md, "m")).toBe("“ip neigh and ARP · map”");
  });

  it("diffs a block's text into cut and typed", () => {
    expect(textDelta("slope is 2x", "slope is x^2")).toEqual({ cut: "2x", typed: "x^2" });
    expect(textDelta("abc", "abcd")).toEqual({ cut: "", typed: "d" });
  });

  it("only flags the block that was dragged, not the ones it shifted", () => {
    const before = [p("a", ""), p("b", ""), p("c", ""), p("d", "")];
    const after = [p("b", ""), p("c", ""), p("d", ""), p("a", "")];
    expect([...movedBlocks(before, after)]).toEqual(["a"]);
  });
});

describe("acts", () => {
  it("commits one act per touched block with before/after text, on the pause", () => {
    const t = harness([h("h1", "Chain rule"), p("a", "f(g(x))")]);
    t.core.change([h("h1", "Chain rule"), p("a", "f(g(x)) = f'(g(x))")]);
    expect(t.core.log.filter((e) => e.kind === "act")).toHaveLength(0);
    t.core.commit();
    const acts = t.core.log.filter((e): e is TraceEvent<"act"> => e.kind === "act");
    expect(acts).toHaveLength(1);
    expect(acts[0]?.payload).toMatchObject({
      op: "edit",
      blockId: "a",
      section: "h1",
      before: "f(g(x))",
      block: { text: "f(g(x)) = f'(g(x))", after: "h1" },
    });
    expect(t.kinds()).toEqual(["first_attempt"]);
  });

  it("replays the notes in order at any moment, including inserts mid-doc", () => {
    const t = harness([h("h1", "A"), p("x", "one")]);
    t.advance(1000);
    t.core.change([h("h1", "A"), p("new", "zero"), p("x", "one")]);
    t.core.commit();
    t.advance(1000);
    t.core.change([h("h1", "A"), p("new", "zero!")]);
    t.core.commit();
    const view = readTrace(t.core.log.map((e, i) => ({ ...e, seq: i })));
    expect(view.topic).toBe("Derivatives");
    expect(notesAt(view, view.start).map((r) => r.id)).toEqual(["h1", "x"]);
    expect(notesAt(view, view.start + 1000).map((r) => r.id)).toEqual(["h1", "new", "x"]);
    expect(notesAt(view, view.end).map((r) => [r.id, r.text])).toEqual([
      ["h1", "A"],
      ["new", "zero!"],
    ]);
  });
});

describe("math", () => {
  it("acts read the plain source the student typed, with LaTeX alongside", () => {
    const m = (text: string, latex: string): Block => ({ id: "m", type: "math", text, latex });
    const t = harness([h("h1", "Limits"), m("", "")]);
    t.core.change([h("h1", "Limits"), m("sqrt(x^2+1)", "\\sqrt{x^{2} + 1}")]);
    t.core.commit();
    const act = t.core.log.find((e): e is TraceEvent<"act"> => e.kind === "act");
    expect(act?.payload).toMatchObject({
      block: { type: "math", text: "sqrt(x^2+1)", latex: "\\sqrt{x^{2} + 1}" },
      summary: "typed “sqrt(x^2+1)”",
    });
    const view = readTrace(t.core.log.map((e, i) => ({ ...e, seq: i })));
    expect(buildContextPack(view).text).toContain("sqrt(x^2+1)");
    expect(buildContextPack(view).text).not.toContain("\\sqrt");
  });
});

describe("landmarks", () => {
  it("stuck = cursor parked in one block with no edits; resumed on the next edit", () => {
    const t = harness([h("h1", "Practice 2"), p("a", "")]);
    t.core.setCursor("a");
    t.advance(STUCK_MS - 5000);
    t.core.tick();
    expect(t.kinds()).toEqual([]);
    t.advance(6000);
    t.core.tick();
    t.core.tick();
    expect(t.kinds()).toEqual(["stuck"]);
    expect(t.landmarks()[0]).toMatchObject({ blockId: "a", section: "h1" });
    expect(t.landmarks()[0]?.label).toMatch(/^Cursor parked \d+s, no edits$/);
    t.advance(2000);
    t.core.change([h("h1", "Practice 2"), p("a", "x = 3")]);
    t.core.commit();
    expect(t.kinds()).toEqual(["stuck", "resumed", "first_attempt"]);
  });

  it("is not stuck without a cursor, while hidden, or when they keep moving between blocks", () => {
    const t = harness([p("a", "one"), p("b", "two")]);
    t.advance(STUCK_MS * 2);
    t.core.tick();
    expect(t.kinds()).toEqual([]);
    t.core.setCursor("a");
    t.advance(STUCK_MS / 2);
    t.core.setCursor("b");
    t.advance(STUCK_MS / 2);
    t.core.tick();
    expect(t.kinds()).toEqual([]);
    t.hide();
    t.advance(STUCK_MS);
    t.core.tick();
    expect(t.kinds()).toEqual([]);
  });

  it("big_erase = a large cut in one block; retyping there soon after = self_correction", () => {
    const t = harness([h("h1", "Power rule"), p("a", LONG)]);
    t.core.change([h("h1", "Power rule"), p("a", "The derivative of x squared is")]);
    t.core.commit();
    expect(t.kinds()).toEqual(["big_erase"]);
    expect(t.landmarks()[0]).toMatchObject({ label: "Cut 36 chars (55%)", section: "h1" });
    t.advance(30_000);
    t.core.change([h("h1", "Power rule"), p("a", "The derivative of x squared is 2x")]);
    t.core.commit();
    expect(t.kinds()).toEqual(["big_erase", "self_correction"]);
  });

  it("small trims are not big erases; retyping elsewhere is not a correction", () => {
    const t = harness([p("a", LONG), p("b", "")]);
    t.core.change([p("a", LONG.slice(0, -6)), p("b", "")]);
    t.core.commit();
    expect(t.kinds()).toEqual([]);
    t.core.change([p("a", "The derivative"), p("b", "")]);
    t.core.commit();
    expect(t.kinds()).toEqual(["big_erase"]);
    t.core.change([p("a", "The derivative"), p("b", "something else")]);
    t.core.commit();
    expect(t.kinds()).toEqual(["big_erase", "first_attempt"]);
  });

  it("cut-and-retype inside one pause reads as a rewrite, not an erase", () => {
    const t = harness([p("a", "the slope is constant everywhere")]);
    t.core.change([p("a", "the slope is changing with x here")]);
    t.core.commit();
    expect(t.kinds()).toEqual(["self_correction"]);
  });

  it("deleting a whole written block is a big erase; rewriting in its section corrects it", () => {
    const t = harness([h("h1", "Q3"), p("a", "my first try at this"), p("b", "")]);
    t.core.change([h("h1", "Q3"), p("b", "")]);
    t.core.commit();
    expect(t.kinds()).toEqual(["big_erase"]);
    t.core.change([h("h1", "Q3"), p("b", "second go")]);
    t.core.commit();
    expect(t.kinds()).toEqual(["big_erase", "self_correction"]);
  });

  it("crops evidence only for sketch blocks", async () => {
    const t = harness([h("h1", "Graph it"), sketch("s", 6), p("a", LONG)]);
    t.core.change([h("h1", "Graph it"), sketch("s", 1), p("a", LONG)]);
    t.core.commit();
    t.core.change([h("h1", "Graph it"), sketch("s", 1), p("a", "The")]);
    t.core.commit();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(t.kinds()).toEqual(["big_erase", "big_erase"]);
    expect(t.crops).toEqual(["s"]);
    expect(t.core.log.filter((e) => e.kind === "evidence")).toHaveLength(1);
  });

  it("help_ask anchors at the cursor block's section", () => {
    const t = harness([h("h1", "Limits"), p("a", "lim x→0 sin x / x")]);
    t.core.setCursor("a");
    t.core.ask("why is this 1?");
    const ask = t.core.log.find((e): e is TraceEvent<"ask"> => e.kind === "ask");
    expect(ask?.payload).toMatchObject({ blockId: "a", section: "h1" });
    expect(t.kinds()).toEqual(["help_ask"]);
  });
});

describe("summaries", () => {
  it("say 'tidied spacing' for whitespace and name a type change", () => {
    const t = harness([p("a", " RAID levels")]);
    t.core.change([{ id: "a", type: "heading", level: 2, text: "RAID levels" }]);
    t.core.commit();
    t.core.change([{ id: "a", type: "heading", level: 2, text: "RAID levels " }]);
    t.core.commit();
    const acts = t.core.log.filter((e): e is TraceEvent<"act"> => e.kind === "act");
    expect(acts.map((a) => a.payload.summary)).toEqual([
      "made “RAID levels” a heading",
      "tidied spacing",
    ]);
  });
});

describe("loop-3 rules", () => {
  it("replacing a clause of a long line is a rewrite", () => {
    const long =
      "/28 leaves 4 host bits so 16 per block. Network is 203.0.113.40 because 45 rounds down to 40.";
    const t = harness([p("a", long)]);
    t.core.change([
      p(
        "a",
        long.replace("40 because 45 rounds down to 40.", "32: blocks start at multiples of 16."),
      ),
    ]);
    t.core.commit();
    expect(t.kinds()).toEqual(["self_correction"]);
  });

  it("records ticking a checklist item", () => {
    const item = (checked: boolean): Block => ({
      id: "c",
      type: "checkListItem",
      text: "Practiced",
      checked,
    });
    const t = harness([item(false)]);
    t.core.change([item(true)]);
    t.core.commit();
    const act = t.core.log.find((e): e is TraceEvent<"act"> => e.kind === "act");
    expect(act?.payload.summary).toBe("ticked “Practiced”");
  });

  it("is not stuck while reading the tutor's lesson or talking to the tutor", () => {
    const t = harness([h("h1", "CIDR"), p("a", "")]);
    t.core.placedByTutor(["l1"], "Lesson on CIDR");
    t.core.change([h("h1", "CIDR"), p("a", ""), p("l1", "A /28 block holds 16 addresses.")]);
    t.core.commit();
    t.core.setCursor("l1");
    t.advance(STUCK_MS * 2);
    t.core.tick();
    expect(t.kinds()).toEqual(["taught"]);
    t.core.setCursor("a");
    t.core.setAside(true);
    t.advance(STUCK_MS * 2);
    t.core.tick();
    expect(t.kinds()).toEqual(["taught"]);
    t.core.setAside(false);
    t.advance(STUCK_MS + 1000);
    t.core.tick();
    expect(t.kinds()).toEqual(["taught", "stuck"]);
  });
});

describe("seen live in Obsidian", () => {
  it("a small cut then new words in its place is a change of mind", () => {
    const say = (text: string) => [h("h1", "Classful IPv4"), p("a", text)];
    const t = harness(say(""));
    t.core.change(say("**Say it:** 10.1.2.3 is class B"));
    t.core.commit();
    t.advance(9000);
    t.core.change(say("**Say it:** 10.1.2.3 is "));
    t.core.commit();
    t.advance(4000);
    t.core.change(say("**Say it:** 10.1.2.3 is class A (first octet 1-126)"));
    t.core.commit();
    expect(t.kinds()).toEqual(["first_attempt", "self_correction"]);
    expect(t.landmarks()[1]?.label).toBe("Changed “class B” to “class A (first octet 1-…”");
  });

  it("a typo fixed with backspace is not a change of mind", () => {
    const t = harness([p("a", "")]);
    t.core.change([p("a", "the networkx")]);
    t.core.commit();
    t.core.change([p("a", "the network")]);
    t.core.commit();
    t.core.change([p("a", "the network address")]);
    t.core.commit();
    expect(t.kinds()).toEqual(["first_attempt"]);
  });

  it("the pack keeps one line per stretch of typing, not one per pause", () => {
    const parts = ["**Say it:** 172.", "16.", "0.", "1 is class B;", " 192.168.1.1 is class C."];
    let text = "";
    const t = harness([h("h1", "Classful"), p("a", "")]);
    for (const part of parts) {
      text += part;
      t.advance(2500);
      t.core.change([h("h1", "Classful"), p("a", text)]);
      t.core.commit();
    }
    const pack = buildContextPack(readTrace(t.core.log.map((e, i) => ({ ...e, seq: i }))));
    expect(pack.data.recentActs).toHaveLength(1);
    expect(pack.data.recentActs[0]?.summary).toBe(
      "typed “**Say it:** 172.16.0.1 is class B; 192.168.1.1 is class C.”",
    );
  });
});

describe("checks and sketches", () => {
  it("records a check as a moment, never as mastery", () => {
    const t = harness([p("a", "")]);
    t.core.checked({
      topic: "journalctl",
      question: "Which command shows only errors for ssh?",
      picked: "journalctl -u ssh",
      answer: "journalctl -u ssh --priority=err",
    });
    expect(t.landmarks()[0]).toMatchObject({ kind: "checked", blockId: null });
    expect(t.landmarks()[0]?.label).toContain("wrong");
  });

  it("keeps a picture of a sketch as it grows, sampled", async () => {
    const t = harness([sketch("s", 0)]);
    t.core.change([sketch("s", 3)]);
    t.core.commit();
    t.advance(5000);
    t.core.change([sketch("s", 6)]);
    t.core.commit();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const shots = t.core.log.filter((e): e is TraceEvent<"evidence"> => e.kind === "evidence");
    expect(shots).toHaveLength(1);
    expect(shots[0]?.payload.landmarkSeq).toBeUndefined();
  });
});

describe("tutor-placed blocks", () => {
  it("are attributed to the tutor and never count as the learner's work", () => {
    const t = harness([h("h1", "Limits"), p("a", "")]);
    t.core.placedByTutor(["l1", "l2"], "Lesson on Limits");
    t.core.change([
      h("h1", "Limits"),
      p("a", ""),
      h("l1", "Lesson: limit laws"),
      p("l2", "The limit of a sum is the sum of the limits."),
    ]);
    t.core.commit();
    const acts = t.core.log.filter((e): e is TraceEvent<"act"> => e.kind === "act");
    expect(acts.map((a) => a.payload.who)).toEqual(["tutor", "tutor"]);
    expect(t.kinds()).toEqual(["taught"]);
    expect(t.landmarks()[0]).toMatchObject({
      label: "Lesson on Limits",
      blockId: "l1",
      section: "l1",
    });
    t.core.change([
      h("h1", "Limits"),
      p("a", ""),
      h("l1", "Lesson: limit laws"),
      p("l2", "The limit of a sum is the sum."),
    ]);
    t.core.commit();
    expect(
      t.core.log.filter((e): e is TraceEvent<"act"> => e.kind === "act").at(-1)?.payload.who,
    ).toBe("learner");
    t.core.checked({ topic: "Limits", question: "lim_(x->5) …", picked: "5", answer: "2√5" });
    const pack = buildContextPack(readTrace(t.core.log.map((e, i) => ({ ...e, seq: i }))));
    expect(pack.text).toContain("[tutor] “Lesson: limit laws”: placed a lesson (2 blocks)");
    expect(pack.text).toContain("### Checks they took");
    expect(pack.data.checks[0]?.label).toContain("wrong");
  });
});

describe("context pack", () => {
  it("names places by heading, says cursor parked, and lists the erase thread", () => {
    const blocks = [h("h1", "Chain rule"), p("a", LONG), h("h2", "Practice"), p("b", "")];
    const t = harness(blocks);
    t.core.change([
      h("h1", "Chain rule"),
      p("a", "The derivative"),
      h("h2", "Practice"),
      p("b", ""),
    ]);
    t.core.commit();
    t.core.setCursor("b");
    t.advance(STUCK_MS + 1000);
    t.core.tick();
    t.core.ask("how do I start?");
    const view = readTrace(t.core.log.map((e, i) => ({ ...e, seq: i })));
    const pack = buildContextPack(view, { goal: "Calculus I" });
    expect(pack.text).toContain("### Sections they worked in (by heading)");
    expect(pack.text).toContain("“Chain rule”: cut");
    expect(pack.text).toContain("“Practice”: cursor parked 46s, then asked for help");
    expect(pack.text).toContain("not rewritten yet");
    expect(pack.text).toContain("at “Practice”: “how do I start?”");
    expect(pack.text).not.toContain("patch");
    expect(pack.data.sections.map((r) => r.name)).toEqual(["“Chain rule”"]);
    expect(pack.images).toEqual([]);
  });

  it("calls a deleted heading's section 'since removed'", () => {
    const t = harness([h("h1", "Scratch"), p("a", "")]);
    t.core.change([h("h1", "Scratch"), p("a", "some work here")]);
    t.core.commit();
    t.core.change([p("a", "some work here")]);
    t.core.commit();
    const view = readTrace(t.core.log.map((e, i) => ({ ...e, seq: i })));
    const pack = buildContextPack(view);
    expect(pack.data.recentActs[0]?.section).toBe("a section since removed");
  });
});
