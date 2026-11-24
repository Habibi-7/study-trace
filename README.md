# Study Trace

An Obsidian plugin that records how you work through a note — what you write and change, where
you pause, what you mark as a question — and an MCP server that lets any AI agent read it back,
frame by frame. Everything stays in your vault.

```
[1:17] “Problem 2 — Which subnet holds 172.16.45.200/20?” · wrote “/20 = 255.255.248.0 so block size $256 - 248 = 8$”
[1:23–2:26] 63s without typing · cursor on “45 sits in 40–47 → network 172.16.40.0” 63s
[2:42] wrote “/20 = 20 bits = 8 + 8 + 4 → 255.255.240.0, block $256 - 240 = 16$.”
[3:07] “Broadcast … 172.16.47.254” → “Broadcast … 172.16.47.255”
[4:21] “Problem 3 — VLSM” · marked a question: “do I always give out the biggest subnet first?”
```

## Install

```bash
pnpm install && pnpm build
mkdir -p "<vault>/.obsidian/plugins/study-trace"
cp packages/obsidian/dist/main.js packages/obsidian/manifest.json "<vault>/.obsidian/plugins/study-trace/"
```

Turn on **Study Trace** in Settings → Community plugins. Then give your agent the trace:

```bash
claude mcp add study-trace -- node "$PWD/packages/mcp/dist/index.js" "<vault>/.study-trace"
```

Study. Stuck on something? Select it and run **Study Trace: Mark a question here**. Later, ask
your agent _"how did my last sitting go?"_
