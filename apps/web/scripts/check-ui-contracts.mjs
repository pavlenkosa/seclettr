import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const guardedBarrels = [
  "src/components/ui/index.ts",
  "src/components/ui/actions/index.ts",
  "src/components/ui/forms/index.ts",
  "src/components/ui/feedback/index.ts",
  "src/components/ui/icons/index.ts",
  "src/components/ui/surfaces/index.ts",
];

const headerPattern = /^\s*(\/\*\*|\/\* ─)/;
const exportPattern = /^export \* from "(.+)";$/gm;

function read(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function hasHeader(relativePath) {
  return headerPattern.test(read(relativePath));
}

function resolveSiblingExport(barrelPath, exportRef) {
  const baseDir = dirname(join(repoRoot, barrelPath));
  return relative(repoRoot, join(baseDir, `${exportRef}.tsx`));
}

const failures = [];

for (const barrel of guardedBarrels) {
  if (!hasHeader(barrel)) {
    failures.push(`${barrel} is missing a file-level ownership/doc header`);
  }

  const text = read(barrel);
  const matches = [...text.matchAll(exportPattern)];
  for (const match of matches) {
    const exportRef = match[1];
    if (!exportRef?.startsWith("./")) continue;
    if (barrel === "src/components/ui/index.ts") continue;
    const target = resolveSiblingExport(barrel, exportRef);
    if (!hasHeader(target)) {
      failures.push(`${target} is missing a file-level ownership/doc header`);
    }
  }
}

if (failures.length > 0) {
  console.error("UI contract guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("UI contract guard passed.");
