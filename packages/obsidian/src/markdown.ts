import type { Block } from "@study-trace/core";

/**
 * A markdown note as the trace reads it: blocks in reading order, each with the lines it
 * spans (so a cursor line maps to a block). Text stays as written — `**bold**`, `code`,
 * `$math$` — because the reader is an LLM or a tutor, not a renderer.
 */

export type Parsed = Omit<Block, "id"> & { from: number; to: number };

const HEADING = /^(#{1,6})\s+(.*)$/;
const TASK = /^\s*[-*+]\s+\[([ xX])\]\s?(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const FENCE = /^\s*(```|~~~)/;

export function parseMarkdown(markdown: string): Parsed[] {
  const lines = markdown.split("\n");
  const out: Parsed[] = [];
  let i = 0;

  // YAML frontmatter is metadata, not study.
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((line, n) => n > 0 && line.trim() === "---");
    if (end > 0) i = end + 1;
  }

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const from = i;

    if (line.trim() === "") {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const close = lines.findIndex((l, n) => n > i && l.trim().startsWith(fence[1] ?? "```"));
      const to = close < 0 ? lines.length - 1 : close;
      out.push({ type: "codeBlock", text: lines.slice(i + 1, to).join("\n"), from, to });
      i = to + 1;
      continue;
    }

    if (line.trim().startsWith("$$")) {
      const sameLine = line.trim().length > 2 && line.trim().endsWith("$$");
      const close = sameLine ? i : lines.findIndex((l, n) => n > i && l.trim().endsWith("$$"));
      const to = close < 0 ? lines.length - 1 : close;
      const text = lines
        .slice(i, to + 1)
        .join("\n")
        .trim()
        .replace(/^\$\$|\$\$$/g, "")
        .trim();
      out.push({ type: "math", text, from, to });
      i = to + 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      out.push({
        type: "heading",
        level: heading[1]?.length,
        text: heading[2]?.trim() ?? "",
        from,
        to: i,
      });
      i++;
      continue;
    }

    const task = TASK.exec(line);
    if (task) {
      out.push({
        type: "checkListItem",
        checked: task[1] !== " ",
        text: task[2] ?? "",
        from,
        to: i,
      });
      i++;
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      out.push({ type: "bulletListItem", text: bullet[1] ?? "", from, to: i });
      i++;
      continue;
    }
    const numbered = NUMBERED.exec(line);
    if (numbered) {
      out.push({ type: "numberedListItem", text: numbered[1] ?? "", from, to: i });
      i++;
      continue;
    }

    // A paragraph runs until a blank line or the start of another block.
    let to = i;
    while (to + 1 < lines.length) {
      const next = lines[to + 1] ?? "";
      if (
        next.trim() === "" ||
        HEADING.test(next) ||
        BULLET.test(next) ||
        NUMBERED.test(next) ||
        FENCE.test(next) ||
        next.trim().startsWith("$$")
      ) {
        break;
      }
      to++;
    }
    const text = lines.slice(i, to + 1).join("\n");
    out.push({ type: text.trimStart().startsWith(">") ? "quote" : "paragraph", text, from, to });
    i = to + 1;
  }
  return out;
}

const key = (b: Omit<Block, "id">) => `${b.type}|${b.level ?? ""}|${b.checked ?? ""}|${b.text}`;

/**
 * Markdown has no block ids, so carry them across edits: unchanged blocks keep theirs
 * (longest common subsequence), and between those anchors changed blocks are paired in
 * order — an edit, not a delete + create. Leftovers are new or gone.
 */
export function reconcile(
  prev: Block[],
  next: Parsed[],
  newId: () => string,
): (Block & { from: number; to: number })[] {
  const a = prev.map(key);
  const b = next.map(key);
  // LCS table, O(n·m) — a note is hundreds of blocks at most.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = lcs[i] as number[];
      row[j] =
        a[i] === b[j]
          ? (lcs[i + 1]?.[j + 1] ?? 0) + 1
          : Math.max(lcs[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const ids: (string | null)[] = next.map(() => null);
  const pairGap = (pi: number[], nj: number[]) => {
    nj.forEach((j, k) => {
      const i = pi[k];
      if (i !== undefined) ids[j] = prev[i]?.id ?? null;
    });
  };
  let i = 0;
  let j = 0;
  let gapPrev: number[] = [];
  let gapNext: number[] = [];
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairGap(gapPrev, gapNext);
      gapPrev = [];
      gapNext = [];
      ids[j] = prev[i]?.id ?? null;
      i++;
      j++;
    } else if ((lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0)) {
      gapPrev.push(i++);
    } else {
      gapNext.push(j++);
    }
  }
  while (i < a.length) gapPrev.push(i++);
  while (j < b.length) gapNext.push(j++);
  pairGap(gapPrev, gapNext);

  return next.map((block, n) => ({ ...block, id: ids[n] ?? newId() }));
}

/** The block a cursor line falls in (or the nearest one above it). */
export function blockAtLine(
  blocks: { id: string; from: number; to: number }[],
  line: number,
): string | null {
  let hit: string | null = null;
  for (const b of blocks) {
    if (b.from > line) break;
    hit = b.id;
  }
  return hit;
}
