import { sectionName, sectionOf } from "@study-trace/core";
import { describe, expect, it } from "vitest";
import { blockAtLine, parseMarkdown, reconcile } from "./markdown";

const NOTE = `---
course: CS-410
---
# CS-410 Midterm Practice

Blue-book exam. Run the **Try** commands first.

## Subnet mask
- [x] Practiced · [ ] Can explain
- **Say it:** a mask marks the network bits; $2^(32-24)-2 = 254$ hosts in a /24
- **Try:** \`ip -br a\`

## Classless IPv4 (CIDR)
- [ ] Practiced
1. Network of \`203.0.113.45/28\`?
2. Broadcast?

$$
2^4 = 16
$$

\`\`\`bash
ip route get 8.8.8.8
\`\`\`
`;

describe("parseMarkdown", () => {
  const blocks = parseMarkdown(NOTE);

  it("reads headings, tasks, lists, math and code as blocks, skipping frontmatter", () => {
    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "heading",
      "checkListItem",
      "bulletListItem",
      "bulletListItem",
      "heading",
      "checkListItem",
      "numberedListItem",
      "numberedListItem",
      "math",
      "codeBlock",
    ]);
    expect(blocks[3]).toMatchObject({ checked: true, text: "Practiced · [ ] Can explain" });
    expect(blocks[4]?.text).toContain("$2^(32-24)-2 = 254$");
    expect(blocks[10]?.text).toBe("2^4 = 16");
    expect(blocks[11]?.text).toBe("ip route get 8.8.8.8");
  });

  it("gives sections by heading", () => {
    const withIds = reconcile([], blocks, counter());
    const cidrTask = withIds[7];
    const section = sectionOf(withIds, cidrTask?.id ?? null);
    expect(sectionName(withIds, section)).toBe("“Classless IPv4 (CIDR)”");
  });

  it("maps a cursor line to its block", () => {
    const withIds = reconcile([], blocks, counter());
    const line = NOTE.split("\n").findIndex((l) => l.startsWith("1. Network"));
    expect(blockAtLine(withIds, line)).toBe(withIds[8]?.id);
  });
});

describe("reconcile", () => {
  const ids = counter();
  const v1 = reconcile([], parseMarkdown("## A\none\n\ntwo\n\nthree"), ids);

  it("keeps ids for unchanged blocks and pairs an edited one with its old id", () => {
    const v2 = reconcile(v1, parseMarkdown("## A\none\n\ntwo, edited\n\nthree"), ids);
    expect(v2.map((b) => b.id)).toEqual(v1.map((b) => b.id));
    expect(v2[2]?.text).toBe("two, edited");
  });

  it("gives an inserted block a new id without disturbing its neighbours", () => {
    const v2 = reconcile(v1, parseMarkdown("## A\none\n\nnew line\n\ntwo\n\nthree"), ids);
    expect(v2.filter((b) => v1.some((o) => o.id === b.id)).map((b) => b.text)).toEqual([
      "A",
      "one",
      "two",
      "three",
    ]);
    expect(v1.some((o) => o.id === v2[2]?.id)).toBe(false);
  });

  it("drops a deleted block's id", () => {
    const v2 = reconcile(v1, parseMarkdown("## A\none\n\nthree"), ids);
    expect(v2.map((b) => b.id)).toEqual([v1[0]?.id, v1[1]?.id, v1[3]?.id]);
  });
});

function counter() {
  let n = 0;
  return () => `b${++n}`;
}
