import type { Extension } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { type DataAdapter, editorInfoField, Notice, Plugin } from "obsidian";
import { type Host, Sitting } from "./sitting";

const TICK_MS = 5000;

/** The real host: Obsidian's clock, window focus, and the vault's file adapter. */
function obsidianHost(adapter: DataAdapter): Host {
  return {
    now: Date.now,
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (id) => window.clearTimeout(id),
    isVisible: () => document.visibilityState === "visible" && document.hasFocus(),
    append: async (path, chunk) => {
      const dir = path.slice(0, path.lastIndexOf("/"));
      if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
      await adapter.append(path, chunk);
    },
  };
}

/**
 * Study Trace for Obsidian: a silent tutor's eyes on your own vault. Sittings are written
 * to `.study-trace/`; any AI agent reads them through the Study Trace MCP server
 * (packages/mcp). Nothing leaves the machine.
 */
export default class StudyTrace extends Plugin {
  private sitting: Sitting | null = null;

  override async onload() {
    this.registerEditorExtension(this.watcher());
    this.registerInterval(
      window.setInterval(() => {
        if (this.sitting?.idle()) void this.endSitting();
      }, TICK_MS),
    );
    this.registerDomEvent(window, "blur", () => this.sitting?.recorder.hidden());
    this.registerDomEvent(window, "focus", () => this.sitting?.recorder.visible());
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (this.sitting && file?.path !== this.sitting.path) void this.endSitting();
      }),
    );

    this.addCommand({
      id: "ask-here",
      name: "Mark a question here (for your tutor)",
      editorCallback: (editor) => {
        const question =
          editor.getSelection().trim() || editor.getLine(editor.getCursor().line).trim();
        this.sitting?.commit(editor.getValue());
        this.sitting?.recorder.ask(question || "(question at this spot)");
        new Notice("Study Trace: noted — your tutor will see it.");
      },
    });
  }

  override async onunload() {
    await this.endSitting();
  }

  private async endSitting() {
    const sitting = this.sitting;
    this.sitting = null;
    await sitting?.end();
  }

  /** A CodeMirror listener on every markdown editor; it follows whichever note you're in. */
  private watcher(): Extension {
    return EditorView.updateListener.of((update: ViewUpdate) => {
      const file = update.state.field(editorInfoField, false)?.file;
      if (file?.extension !== "md") return;
      // Obsidian reloading the note from disk (a sync, a script, git) isn't the learner
      // writing: end the sitting and start fresh from what's on disk now.
      const reloaded = update.transactions.some((tr) => tr.isUserEvent("set"));
      if (reloaded && this.sitting?.path === file.path) {
        const sitting = this.sitting;
        this.sitting = null;
        void sitting.end(update.startState.doc.toString());
      }
      if (this.sitting?.path !== file.path) {
        if (!update.view.hasFocus && !reloaded) return;
        void this.endSitting();
        this.sitting = new Sitting(
          obsidianHost(this.app.vault.adapter),
          file.path,
          update.state.doc.toString(),
        );
      }
      const sitting = this.sitting;
      if (!sitting) return;
      if (update.docChanged) sitting.changed(() => update.view.state.doc.toString());
      if (update.viewportChanged || update.geometryChanged) {
        const ranges = update.view.visibleRanges;
        const first = ranges[0];
        const last = ranges.at(-1);
        if (first && last) {
          const doc = update.state.doc;
          sitting.viewing(doc.lineAt(first.from).number - 1, doc.lineAt(last.to).number - 1);
        }
      }
      if (update.selectionSet || update.docChanged) {
        sitting.cursorAt(update.state.doc.lineAt(update.state.selection.main.head).number - 1);
      }
    });
  }
}
