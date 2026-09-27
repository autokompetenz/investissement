/**
 * Test runner, phase 6.
 *
 * Node cannot import TypeScript directly before 22.6, so the tests are compiled
 * with the TypeScript already in the project and then run with the built-in
 * runner. No test framework is added to the dependencies.
 *
 * The compiled output keeps the `@/` alias that the application uses, so a
 * resolve hook maps it back onto the build directory. Without it, the services
 * under test could not be imported outside of Vite.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".test-build");

rmSync(outDir, { recursive: true, force: true });

const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const compile = spawnSync(process.execPath, [tsc, "-p", "tsconfig.test.json"], {
  cwd: root,
  stdio: "inherit",
});

if (compile.status !== 0) process.exit(compile.status ?? 1);

if (!existsSync(join(outDir, "tests"))) {
  console.error("Compilation produced no tests directory.");
  process.exit(1);
}

mkdirSync(join(outDir, "hooks"), { recursive: true });

// Resolver: "@/services/x" becomes the compiled "./src/services/x.js".
writeFileSync(
  join(outDir, "hooks", "resolver.mjs"),
  `export function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    return next(new URL("../src/" + specifier.slice(2) + ".js", import.meta.url).href, context);
  }
  return next(specifier, context);
}
`,
);

// Entry point loaded with --import: registers the resolver.
writeFileSync(
  join(outDir, "hooks", "register.mjs"),
  `import { register } from "node:module";
register("./resolver.mjs", import.meta.url);
`,
);

// Each test file is passed by name rather than the `tests/` directory. Node
// resolves a directory import to its `index` module, and a test directory has
// none, so `--test tests/` aborted before running anything — with
// ERR_UNSUPPORTED_DIR_IMPORT, which reads like a broken build rather than a
// broken argument.
const testFiles = readdirSync(join(outDir, "tests"))
  .filter((name) => name.endsWith(".test.js"))
  .sort()
  .map((name) => join("tests", name));

if (testFiles.length === 0) {
  console.error("No compiled test file found.");
  process.exit(1);
}

const run = spawnSync(
  process.execPath,
  ["--import", "./hooks/register.mjs", "--test", ...testFiles],
  { cwd: outDir, stdio: "inherit" },
);

process.exit(run.status ?? 1);
