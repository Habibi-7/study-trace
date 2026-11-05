import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildContextPack, formatClock, notesAt, sectionName, toMarkdown } from "@study-trace/core";
import { z } from "zod";
import { loadSittings, moment, pick, recap, type Sitting } from "./sittings";

/**
 * Study Trace over MCP: any agent (Claude, Cursor, …) can read how a learner has been
 * studying — what a tutor beside them would have noticed. Reads the JSONL sittings the
 * Obsidian plugin writes to `<vault>/.study-trace`. Local, read-only.
 *
 *   study-trace-mcp /path/to/vault/.study-trace     (or STUDY_TRACE_DIR)
 */

const dir = process.argv[2] ?? process.env.STUDY_TRACE_DIR;
if (!dir) {
  console.error(
    "usage: study-trace-mcp <trace dir>  (e.g. ~/Notes/.study-trace), or set STUDY_TRACE_DIR",
  );
  process.exit(1);
}

const server = new McpServer({ name: "study-trace", version: "0.1.0" });

const text = (body: string) => ({ content: [{ type: "text" as const, text: body }] });
const which = {
  session: z.string().optional().describe("Sitting id from list_sittings. Default: the latest."),
  note: z
    .string()
    .optional()
    .describe("Part of a note's path, to pick its latest sitting instead."),
};

async function find(session?: string, note?: string): Promise<Sitting | string> {
  const sittings = await loadSittings(dir as string);
  if (sittings.length === 0)
    return `No sittings yet in ${dir}. Study a note in Obsidian with the Study Trace plugin on.`;
  return (
    pick(sittings, session, note) ?? `No sitting matches ${session ?? note}. Try list_sittings.`
  );
}

server.registerTool(
  "list_sittings",
  {
    title: "List study sittings",
    description:
      "Recent study sittings (one per note opened and worked in): when, how long, which note, how many edits and notable moments. Start here.",
    inputSchema: { limit: z.number().int().min(1).max(50).optional() },
  },
  async ({ limit }) => {
    const sittings = (await loadSittings(dir)).slice(0, limit ?? 10);
    if (sittings.length === 0) return text(`No sittings yet in ${dir}.`);
    return text(
      sittings
        .map(
          (s) =>
            `- ${s.sessionId} · ${new Date(s.startedAt).toLocaleString()} · ${formatClock(s.endedAt - s.startedAt)} · ${s.note ?? "?"} · ${s.edits} edits · ${s.moments} moments`,
        )
        .join("\n"),
    );
  },
);

server.registerTool(
  "get_recap",
  {
    title: "Recap of recent sittings",
    description:
      "The arc across the learner's recent sittings in one read (oldest first): per sitting, when and how long, which note, where it was hard, what they asked, whether they ended stuck. Best first call for 'how has my studying gone?'.",
    inputSchema: {
      note: z.string().optional().describe("Only sittings on notes whose path contains this."),
      limit: z.number().int().min(1).max(20).optional(),
    },
  },
  async ({ note, limit }) => text(recap(await loadSittings(dir), { note, limit })),
);

server.registerTool(
  "get_context_pack",
  {
    title: "What a tutor would have noticed",
    description:
      "The learner's sitting as a tutor sitting beside them would summarize it: where they are, where it was hard (stalls, big erases, rewrites), the sections they worked in, recent edits, questions they marked. A sensor log — what happened, not what they know. Use it before helping someone with what they're studying.",
    inputSchema: {
      ...which,
      at: z
        .string()
        .optional()
        .describe('A moment: "m:ss" into the sitting, ISO time, or epoch ms. Default: the end.'),
      format: z.enum(["markdown", "json"]).optional(),
    },
  },
  async ({ session, note, at, format }) => {
    const sitting = await find(session, note);
    if (typeof sitting === "string") return text(sitting);
    const pack = buildContextPack(sitting.view, { at: moment(sitting, at), topic: sitting.note });
    return text(format === "json" ? JSON.stringify(pack.data, null, 2) : pack.text);
  },
);

server.registerTool(
  "get_moments",
  {
    title: "Notable moments in a sitting",
    description:
      "Stalls, big erases, self-corrections, first words, marked questions — each with its time and the section (heading) it happened in.",
    inputSchema: which,
  },
  async ({ session, note }) => {
    const sitting = await find(session, note);
    if (typeof sitting === "string") return text(sitting);
    const { view } = sitting;
    const lines = view.landmarks.map((l) => {
      const blocks = notesAt(view, l.t);
      return `- ${formatClock(l.t - view.start)} · ${l.kind} · ${sectionName(blocks, l.section)} · ${l.label}`;
    });
    return text(lines.join("\n") || "No notable moments yet.");
  },
);

server.registerTool(
  "get_notes_at",
  {
    title: "The note as it stood at a moment",
    description:
      "The learner's note, as markdown, exactly as it was at a given moment of the sitting (default: the end).",
    inputSchema: { ...which, at: z.string().optional() },
  },
  async ({ session, note, at }) => {
    const sitting = await find(session, note);
    if (typeof sitting === "string") return text(sitting);
    return text(toMarkdown(notesAt(sitting.view, moment(sitting, at))) || "(empty)");
  },
);

await server.connect(new StdioServerTransport());
