import esbuild from "esbuild";

// Obsidian provides these at runtime; everything else (incl. @study-trace/core) is bundled.
const external = ["obsidian", "electron", "@codemirror/*", "@lezer/*"];

const options = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  target: "es2022",
  platform: "browser",
  external,
  outfile: "dist/main.js",
  sourcemap: process.argv.includes("--watch") ? "inline" : false,
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
