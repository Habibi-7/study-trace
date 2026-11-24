import { describe, expect, it } from "vitest";
import { notesAt, readTrace, sectionName, sectionOf, textDelta, timeline } from "./read";
import { movedBlocks, QUIET_MS, Recorder } from "./recorder";
import type { Block, QuietPayload, TraceEvent } from "./types";

function harness(blocks: Block[]) {
  let now = 1_000_000;
  let seq = 0;
  const core = new Recorder({
    now: () => now,
    emit: () => seq++,
    isVisible: () => true,
  });
  core.start(blocks, "Derivatives");
  return {
    core,
    advance: (ms: number) => {
      now += ms;
    },
    quiets: () =>
      core.log
        .filter((e): e is TraceEvent<"quiet"> => e.kind === "quiet")
        .map((e) => e.payload as QuietPayload),
    view: () => readTrace(core.log.map((e, i) => ({ ...e, seq: i }))),
  };
}

const h = (id: string, text: string): Block => ({ id, type: "heading", text, level: 2 });
const p = (id: string, text: string): Block => ({ id, type: "paragraph", text });

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
    expect(textDelta("slope is 2x", "slope is x^2")).toEqual({ cut: "2x", typed: "x^2", at: 9 });
    expect(textDelta("abc", "abcd")).toEqual({ cut: "", typed: "d", at: 3 });
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
  it("acts read the plain source the student typed", () => {
    const m = (text: string): Block => ({ id: "m", type: "math", text });
    const t = harness([h("h1", "Limits"), m("")]);
    t.core.change([h("h1", "Limits"), m("sqrt(x^2+1)")]);
    t.core.commit();
    const act = t.core.log.find((e): e is TraceEvent<"act"> => e.kind === "act");
    expect(act?.payload).toMatchObject({
      block: { type: "math", text: "sqrt(x^2+1)" },
      summary: "typed “sqrt(x^2+1)”",
    });
  });
});

describe("quiet frames", () => {
  it("writes down a stretch without typing: how long, where the cursor sat, time away", () => {
    const t = harness([h("h1", "Problem 2"), p("a", "network 172.16.40.0"), p("b", "")]);
    t.core.setCursor("a");
    t.core.setRange({ first: "h1", last: "b" });
    t.advance(40_000);
    t.core.setCursor("b");
    t.advance(8_000);
    t.core.hidden();
    t.advance(12_000);
    t.core.visible();
    t.advance(2_000);
    t.core.typing();
    expect(t.quiets()).toEqual([
      {
        from: 1_000_000,
        ms: 62_000,
        spots: [
          { blockId: "a", section: "h1", ms: 40_000 },
          { blockId: "b", section: "h1", ms: 10_000 },
        ],
        awayMs: 12_000,
        view: { first: "h1", last: "b" },
      },
    ]);
  });

  it("ignores pauses shorter than QUIET_MS, and counts from the last keystroke", () => {
    const t = harness([p("a", "")]);
    t.core.setCursor("a");
    t.advance(QUIET_MS - 1000);
    t.core.typing();
    t.advance(QUIET_MS - 1000);
    t.core.typing();
    expect(t.quiets()).toEqual([]);
    t.advance(QUIET_MS);
    t.core.stop();
    expect(t.quiets()).toHaveLength(1);
  });
});

describe("timeline", () => {
  // Seen in a real sitting: labels said "cut 109 chars (96%)" and hid the mistake itself.
  it("shows what was wrong and what replaced it, with the pause in between", () => {
    const wrong = "/20 = 255.255.248.0 so block size $256 - 248 = 8$";
    const right = "/20 = 8 + 8 + 4 bits → 255.255.240.0, block $256 - 240 = 16$";
    const t = harness([h("h1", "Problem 2"), p("a", "")]);
    t.advance(5000);
    t.core.typing();
    t.core.change([h("h1", "Problem 2"), p("a", "/20 = 255.255.248.0")]);
    t.core.commit();
    t.advance(3000);
    t.core.typing();
    t.core.change([h("h1", "Problem 2"), p("a", wrong)]);
    t.core.commit();
    t.advance(60_000);
    t.core.typing();
    t.core.change([h("h1", "Problem 2"), p("a", right)]);
    t.core.commit();
    t.core.ask("is /20 really 240?");
    t.core.stop();
    expect(timeline(t.view())).toEqual([
      `[0:05] “Problem 2” · wrote “${wrong}”`,
      `[0:08–1:08] 60s without typing · cursor on “${wrong}” 60s`,
      `[1:08] “${wrong}” → “${right}”`,
      "[1:08] marked a question: “is /20 really 240?”",
    ]);
  });

  // Seen live: ".254" typed, then cut and retyped as ".255", merged into one "wrote …255".
  it("keeps a change of mind inside a run of typing, but not a typo fixed", () => {
    const t = harness([h("h1", "P2"), p("a", "")]);
    for (const text of [
      "Broadcast: 172.16.47.25",
      "Broadcast: 172.16.47.254",
      "Broadcast: 172.16.",
      "Broadcast: 172.16.47.255",
      "Broadcast: 172.16.47.25 ok",
      "Broadcast: 172.16.47.255 ok",
    ]) {
      t.advance(2000);
      t.core.change([h("h1", "P2"), p("a", text)]);
      t.core.commit();
    }
    expect(timeline(t.view())).toEqual([
      "[0:02] “P2” · wrote “Broadcast: 172.16.47.254”",
      "[0:06] “Broadcast: 172.16.47.254” → “Broadcast: 172.16.47.255 ok”",
    ]);
  });

  it("says a long block's change with just enough context", () => {
    const long = `${"Subnetting notes. ".repeat(10)}Broadcast is 172.16.47.254`;
    const t = harness([h("h1", "P2"), p("a", long)]);
    t.core.change([h("h1", "P2"), p("a", long.replace("47.254", "47.255"))]);
    t.core.commit();
    expect(timeline(t.view())).toEqual([
      "[0:00] “P2” · “…notes. Broadcast is 172.16.47.254” → “…notes. Broadcast is 172.16.47.255”",
    ]);
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

describe("ticks", () => {
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
});
