import { describe, expect, it } from "vitest";
import { type Host, Sitting } from "./sitting";

function host() {
  const files = new Map<string, string>();
  let now = 1_000_000;
  const h: Host = {
    now: () => now,
    setTimeout: () => 0,
    clearTimeout: () => {},
    isVisible: () => true,
    append: async (path, chunk) => {
      files.set(path, (files.get(path) ?? "") + chunk);
    },
  };
  return { h, files, advance: (ms: number) => (now += ms) };
}

describe("Sitting", () => {
  it("writes nothing for a note opened and left untouched", async () => {
    const { h, files } = host();
    const s = new Sitting(h, "Start here.md", "# Start here\n\nRead me.", "obsidian-test");
    await s.end("# Start here\n\nRead me.");
    expect(files.size).toBe(0);
  });

  it("writes the whole sitting once something happens", async () => {
    const { h, files, advance } = host();
    const s = new Sitting(h, "CS-410.md", "## Subnet mask\n- **Say it:**", "obsidian-test");
    advance(5000);
    await s.end("## Subnet mask\n- **Say it:** a mask marks the network bits");
    const lines = files.get(".study-trace/obsidian-test.jsonl")?.trim().split("\n") ?? [];
    const kinds = lines.map((l) => JSON.parse(l).kind);
    expect(kinds[0]).toBe("session");
    expect(kinds).toContain("act");
    expect(kinds.at(-1)).toBe("session");
  });
});
