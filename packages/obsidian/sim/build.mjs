import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["sim/sittings.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "dist-sim/sittings.mjs",
  logLevel: "warning",
});
