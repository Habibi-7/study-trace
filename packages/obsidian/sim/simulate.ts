/**
 * Study simulator: drives the plugin's real `Sitting` with a real CodeMirror EditorState,
 * keystroke by keystroke, on a virtual clock — so a 25-minute sitting runs in a second but
 * every event carries the time it would really have had. Writes JSONL into a vault exactly
 * like the plugin, and saves the edited note back. Used to dogfood the capture pipeline
 * without driving Obsidian's window.
 *
 *   node dist-sim/simulate.mjs <vault> <script>      (see scripts.ts)
 */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { EditorSelection, EditorState, type TransactionSpec } from "@codemirror/state";
import { STUCK_MS } from "@study-trace/core";
import { type Host, Sitting } from "../src/sitting";

const TICK_MS = 5000;
const VIEW_LINES = 40;

/** Timers on a clock we move by hand; the plugin's 5 s tick fires as time passes. */
class Clock {
  t: number;
  private timers = new Map<number, { at: number; fn: () => void }>();
  private next = 1;
  private nextTickAt: number;
  constructor(start: number) {
    this.t = start;
    this.nextTickAt = start + TICK_MS;
  }
  setTimeout = (fn: () => void, ms: number) => {
    const id = this.next++;
    this.timers.set(id, { at: this.t + ms, fn });
    return id;
  };
  clearTimeout = (id: number | undefined) => {
    if (id !== undefined) this.timers.delete(id);
  };
  /** Move time forward, firing due timers and ticks in time order. */
  advance(ms: number, tick: () => void) {
    const end = this.t + ms;
    for (;;) {
      const [id, timer] = [...this.timers.entries()].sort((a, b) => a[1].at - b[1].at)[0] ?? [];
      const at = Math.min(timer?.at ?? Number.POSITIVE_INFINITY, this.nextTickAt);
      if (at > end) break;
      this.t = Math.max(this.t, at);
      if (timer && id !== undefined && timer.at === at) {
        this.timers.delete(id);
        timer.fn();
      } else {
        this.nextTickAt += TICK_MS;
        tick();
      }
    }
    this.t = end;
  }
}

/** Deterministic randomness so a sitting replays the same way. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export class Student {
  readonly clock: Clock;
  private state: EditorState;
  private sitting!: Sitting;
  private random: () => number;
  private viewTop = 0;

  constructor(
    private readonly vault: string,
    private readonly note: string,
    start: Date,
    seed = 7,
  ) {
    this.clock = new Clock(start.getTime());
    this.random = rng(seed);
    this.state = EditorState.create({ doc: "" });
  }

  async open() {
    this.state = EditorState.create({ doc: await readFile(join(this.vault, this.note), "utf8") });
    const host: Host = {
      now: () => this.clock.t,
      setTimeout: this.clock.setTimeout,
      clearTimeout: this.clock.clearTimeout,
      isVisible: () => true,
      append: async (path, chunk) => {
        const file = join(this.vault, path);
        await mkdir(dirname(file), { recursive: true });
        await appendFile(file, chunk);
      },
    };
    this.sitting = new Sitting(
      host,
      this.note,
      this.state.doc.toString(),
      `obsidian-sim-${this.clock.t}`,
    );
    this.scrollTo(0);
    return this;
  }

  private get line() {
    return this.state.doc.lineAt(this.state.selection.main.head).number - 1;
  }

  private scrollTo(line: number) {
    if (line >= this.viewTop && line < this.viewTop + VIEW_LINES - 5) return;
    this.viewTop = Math.max(0, line - 10);
    this.sitting.viewing(this.viewTop, this.viewTop + VIEW_LINES);
  }

  private apply(spec: TransactionSpec) {
    const tr = this.state.update(spec);
    this.state = tr.state;
    if (tr.docChanged) this.sitting.changed(() => this.state.doc.toString());
    this.sitting.cursorAt(this.line);
    this.scrollTo(this.line);
  }

  /** Let time pass (reading, thinking, staring) — ticks fire as they would. */
  wait(seconds: number) {
    this.clock.advance(seconds * 1000, () => this.sitting.recorder.tick());
    return this;
  }

  /** Click at the end of the first line (after `after`, if given) containing `text`. */
  goTo(text: string, after?: string) {
    const lines = this.state.doc.toString().split("\n");
    const startAt = after ? lines.findIndex((l) => l.includes(after)) : 0;
    const index = lines.findIndex((l, i) => i >= Math.max(0, startAt) && l.includes(text));
    if (index < 0) throw new Error(`no line with "${text}"${after ? ` after "${after}"` : ""}`);
    const line = this.state.doc.line(index + 1);
    this.apply({ selection: EditorSelection.cursor(line.to) });
    return this.wait(1 + this.random() * 2);
  }

  /** Type like a person: ~3–6 chars/s, a pause between sentences, the odd typo fixed. */
  type(text: string) {
    for (const ch of text) {
      if (/[a-z]/.test(ch) && this.random() < 0.025) {
        this.key("x");
        this.wait(0.4);
        this.backspace(1);
      }
      this.key(ch);
      const gap = ch === "." || ch === ":" ? 1.5 + this.random() * 3 : 0.15 + this.random() * 0.25;
      this.wait(gap);
    }
    return this;
  }

  newLine(prefix = "") {
    this.key(`\n${prefix}`);
    return this.wait(0.5);
  }

  private key(text: string) {
    const at = this.state.selection.main.head;
    this.apply({
      changes: { from: at, insert: text },
      selection: EditorSelection.cursor(at + text.length),
    });
  }

  backspace(n: number) {
    for (let i = 0; i < n; i++) {
      const at = this.state.selection.main.head;
      if (at === 0) break;
      this.apply({ changes: { from: at - 1, to: at }, selection: EditorSelection.cursor(at - 1) });
      this.wait(0.05);
    }
    return this;
  }

  /** Select the rest of the line from `text` and delete it (a decisive erase). */
  eraseFrom(text: string) {
    const line = this.state.doc.lineAt(this.state.selection.main.head);
    const at = line.text.indexOf(text);
    if (at < 0) throw new Error(`"${text}" not on the current line`);
    this.apply({
      changes: { from: line.from + at, to: line.to },
      selection: EditorSelection.cursor(line.from + at),
    });
    return this.wait(1);
  }

  /** Tick the first `[ ]` on the first line containing `text` after the heading `after`. */
  tick(text: string, after: string) {
    this.goTo(text, after);
    const line = this.state.doc.lineAt(this.state.selection.main.head);
    const at = line.text.indexOf("[ ]");
    if (at < 0) throw new Error(`no box on "${line.text}"`);
    this.apply({ changes: { from: line.from + at + 1, to: line.from + at + 2, insert: "x" } });
    return this.wait(1);
  }

  /** Sit with the cursor still: reading, thinking — or stuck. */
  stall(seconds = STUCK_MS / 1000 + 15) {
    return this.wait(seconds);
  }

  /** "Mark a question here". */
  ask(question: string) {
    this.sitting.commit(this.state.doc.toString());
    this.sitting.recorder.ask(question);
    return this.wait(2);
  }

  async close() {
    await this.sitting.end(this.state.doc.toString());
    await writeFile(join(this.vault, this.note), this.state.doc.toString());
    return this.sitting.sessionId;
  }
}
