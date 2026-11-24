import { type Block, Recorder, type TraceEvent, TYPING_IDLE_MS } from "@study-trace/core";
import { blockAtLine, parseMarkdown, reconcile } from "./markdown";

/** Where sittings live, inside the vault but out of sight. One JSONL file per sitting. */
export const TRACE_DIR = ".study-trace";
const FLUSH_MS = 2000;
/** No edits or questions for this long and the sitting is over; the next keystroke starts a new one. */
export const IDLE_END_MS = 10 * 60_000;

/**
 * What a sitting needs from its host. Obsidian provides the real ones (main.ts); a test or
 * the study simulator provides a virtual clock and a file writer. No Obsidian API in here.
 */
export type Host = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (id: number | undefined) => void;
  isVisible: () => boolean;
  /** Append text to a vault-relative path, creating folders as needed. */
  append: (path: string, chunk: string) => Promise<void>;
};

type Located = Block & { from: number; to: number };

/**
 * One note, open and being studied: parses the markdown into blocks on the typing pause,
 * keeps their ids across edits, maps cursor lines to blocks, and feeds the
 * shared Recorder. Events go to `.study-trace/<session>.jsonl`.
 */
export class Sitting {
  readonly sessionId: string;
  readonly recorder: Recorder;
  private blocks: Located[] = [];
  private nextId = 0;
  private seq = 0;
  private lines: string[] = [];
  private flushTimer: number | undefined;
  /** Opening a note and leaving isn't a sitting: write nothing until something happens. */
  private happened = false;
  private commitTimer: number | undefined;
  private lastActive: number;

  constructor(
    private readonly host: Host,
    readonly path: string,
    doc: string,
    sessionId = `obsidian-${crypto.randomUUID()}`,
  ) {
    this.sessionId = sessionId;
    this.lastActive = host.now();
    this.recorder = new Recorder({
      now: host.now,
      emit: (kind, payload, t) => this.emit(kind, payload, t),
      isVisible: host.isVisible,
    });
    this.blocks = this.parse(doc);
    // The note's path is the sitting's "topic": what they had open.
    this.recorder.start(this.plain(), path);
  }

  /** The doc changed; acts commit on the typing pause. */
  changed(doc: () => string) {
    this.host.clearTimeout(this.commitTimer);
    this.commitTimer = this.host.setTimeout(() => this.commit(doc()), TYPING_IDLE_MS);
  }

  /** Commit now (before an ask, or the end). */
  commit(doc?: string) {
    this.host.clearTimeout(this.commitTimer);
    this.commitTimer = undefined;
    if (doc !== undefined) {
      this.blocks = this.parse(doc);
      this.recorder.change(this.plain());
    }
    this.recorder.commit();
  }

  /** Gone quiet long enough that this sitting is over. */
  idle(): boolean {
    return this.host.now() - this.lastActive >= IDLE_END_MS;
  }

  cursorAt(line: number) {
    this.recorder.setCursor(blockAtLine(this.blocks, line));
  }

  async end(doc?: string) {
    this.commit(doc);
    this.recorder.stop();
    await this.flush();
  }

  async flush() {
    this.host.clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    if (this.lines.length === 0 || !this.happened) return;
    const chunk = `${this.lines.join("\n")}\n`;
    this.lines = [];
    await this.host.append(`${TRACE_DIR}/${this.sessionId}.jsonl`, chunk);
  }

  private emit(kind: TraceEvent["kind"], payload: unknown, t = this.host.now()): number {
    const seq = this.seq++;
    this.lines.push(JSON.stringify({ seq, t, kind, payload }));
    if (kind === "act" || kind === "landmark" || kind === "ask") this.happened = true;
    if (kind === "act" || kind === "ask") this.lastActive = t;
    if (this.flushTimer === undefined) {
      this.flushTimer = this.host.setTimeout(() => void this.flush(), FLUSH_MS);
    }
    return seq;
  }

  private parse(doc: string): Located[] {
    return reconcile(this.blocks, parseMarkdown(doc), () => `b${++this.nextId}`);
  }

  private plain(): Block[] {
    return this.blocks.map(({ from: _f, to: _t, ...block }) => block);
  }
}
