import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { notesAt, toMarkdown } from "@study-trace/core";
import { z } from "zod";
import { listLine, loadSittings, moment, pick, recap, type Sitting, sittingText } from "./sittings";

/**
 * Study Trace over MCP: any agent (Claude, Cursor, …) can read how a learner has been
 * studying, as plain frames. Reads the JSONL sittings the Obsidian plugin writes to
 * `<vault>/.study-trace`. Local, read-only.
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
  session: z
    .string()
    .optional()
    .describe("Sitting id (from list_sittings or a timeline header). Default: the latest."),
  note: z
    .string()
    .optional()
    .describe("Part of a note's path: picks that note's latest sitting. Prefer `session`."),
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
      "Recent study sittings (one per note worked in; a sitting ends after 10 quiet minutes or when they switch notes): id, when, how long, which note, edits, questions marked, longest pause. Newest first.",
    inputSchema: { limit: z.number().int().min(1).max(50).optional() },
  },
  async ({ limit }) => {
    const sittings = (await loadSittings(dir)).slice(0, limit ?? 10);
    if (sittings.length === 0) return text(`No sittings yet in ${dir}.`);
    return text(sittings.map((s) => `- ${listLine(s)}`).join("\n"));
  },
);

const FRAMES =
  "Each line is a frame stamped m:ss into the sitting: what they typed or changed (block text before → after), " +
  "stretches of 10s+ without typing (where the cursor sat, what was on screen, time away from Obsidian), " +
  "and questions they marked. Facts only, no labels: read the pauses, erasures and rewrites yourself.";

server.registerTool(
  "get_sitting",
  {
    title: "One study sitting, frame by frame",
    description: `Everything that happened in one sitting, in order. ${FRAMES}`,
    inputSchema: which,
  },
  async ({ session, note }) => {
    const sitting = await find(session, note);
    return text(typeof sitting === "string" ? sitting : sittingText(sitting));
  },
);

server.registerTool(
  "get_recap",
  {
    title: "Recent sittings, frame by frame",
    description: `The learner's recent sittings, oldest first, each as a full timeline. ${FRAMES} Best first call for "how has my studying gone?".`,
    inputSchema: {
      note: z.string().optional().describe("Only sittings on notes whose path contains this."),
      limit: z.number().int().min(1).max(10).optional().describe("How many sittings (default 3)."),
    },
  },
  async ({ note, limit }) => text(recap(await loadSittings(dir), { note, limit })),
);

server.registerTool(
  "get_notes_at",
  {
    title: "The note as it stood at a moment",
    description:
      "The learner's note, as markdown, exactly as it was at a moment of a sitting (default: the end). Use it to see the whole page around a frame.",
    inputSchema: {
      ...which,
      at: z
        .string()
        .optional()
        .describe('"m:ss" into the sitting (as in the timeline), or an ISO time.'),
    },
  },
  async ({ session, note, at }) => {
    const sitting = await find(session, note);
    if (typeof sitting === "string") return text(sitting);
    return text(toMarkdown(notesAt(sitting.view, moment(sitting, at))) || "(empty)");
  },
);

await server.connect(new StdioServerTransport());
