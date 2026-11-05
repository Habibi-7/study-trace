import type { Extension } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { buildContextPack, readTrace } from "@study-trace/core";
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
    this.registerInterval(window.setInterval(() => this.sitting?.recorder.tick(), TICK_MS));
    this.registerDomEvent(window, "blur", () => this.sitting?.recorder.hidden());
    this.registerDomEvent(window, "focus", () => this.sitting?.recorder.visible());
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (this.sitting && file?.path !== this.sitting.path) void this.endSitting();
      }),
    );

    this.addCommand({
      id: "copy-context-pack",
      name: "Copy what a tutor would see (ContextPack)",
      callback: async () => {
        const sitting = this.sitting;
        if (!sitting) {
          new Notice("Study Trace: open a note and study for a moment first.");
          return;
        }
        sitting.commit();
        const pack = buildContextPack(readTrace(sitting.recorder.log), { at: Date.now() });
        await navigator.clipboard.writeText(pack.text);
        new Notice("Study Trace: ContextPack copied.");
      },
    });
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
      if (this.sitting?.path !== file.path) {
        if (!update.view.hasFocus) return;
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
      if (update.selectionSet || update.docChanged) {
        sitting.cursorAt(update.state.doc.lineAt(update.state.selection.main.head).number - 1);
      }
      if (update.viewportChanged || update.geometryChanged) {
        const { from, to } = update.view.viewport;
        sitting.viewing(
          update.state.doc.lineAt(from).number - 1,
          update.state.doc.lineAt(to).number - 1,
        );
      }
    });
  }
}
