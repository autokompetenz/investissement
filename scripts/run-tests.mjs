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
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  // The API handlers import each other without an extension, which TypeScript
  // accepts and the Vercel preset bundles. Node, running the compiled output,
  // does not complete a file name, so the extension is added back here. It is
  // the one place that knows, rather than every import carrying it for the
  // bundler's benefit.
  if (/^\\.\\.?\\/[A-Za-z0-9_./-]+$/.test(specifier) && !/\\.[cm]?js$/.test(specifier)) {
    return next(specifier + ".js", context);
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

// The API tests are integration tests: they write to a real database with fixed
// addresses, so a second run collides on the unique email. Clearing them first
// is what makes the suite repeatable. Only the rows the suite created are
// removed, and the step is skipped when no database is configured — the unit
// tests run either way.
const nettoyer = join(outDir, "tests", "nettoyer-base.js");
if (existsSync(nettoyer) && process.env.DATABASE_URL) {
  const prep = spawnSync(process.execPath, ["--import", "./hooks/register.mjs", nettoyer], {
    cwd: outDir,
    stdio: "inherit",
  });
  if (prep.status !== 0) {
    console.error("Database cleanup failed; the API tests would not be repeatable.");
    process.exit(prep.status ?? 1);
  }
}

// `.env` is loaded by hand. The API tests are the only ones that need a real
// DATABASE_URL, and Node 20 does not read an `.env` file on its own. Values are
// only read, never written, and the file is never versioned.
const envPath = join(root, ".env");
if (existsSync(envPath)) {
  for (const ligne of readFileSync(envPath, "utf-8").split("\n")) {
    const correspondance = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(ligne.trim());
    if (!correspondance) continue;
    const [, nom, brut] = correspondance;
    const valeur = brut.replace(/^["']|["']$/g, "");
    if (process.env[nom] === undefined) process.env[nom] = valeur;
  }
}

const run = spawnSync(
  process.execPath,
  ["--import", "./hooks/register.mjs", "--test", ...testFiles],
  { cwd: outDir, stdio: "inherit" },
);

process.exit(run.status ?? 1);
