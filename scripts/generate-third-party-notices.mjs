#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const outputPath = path.join(rootDir, "THIRD_PARTY_NOTICES.md");
const checkMode = process.argv.includes("--check");
const strictMode = process.argv.includes("--strict");

const pnpmResult = spawnSync("pnpm", ["licenses", "list", "--prod", "--json"], {
  cwd: rootDir,
  encoding: "utf8",
});

if (pnpmResult.status !== 0) {
  const stderr = pnpmResult.stderr?.trim();
  const stdout = pnpmResult.stdout?.trim();
  const reason = stderr || stdout || "unknown error";
  console.error(`[licenses] failed to read production licenses: ${reason}`);
  process.exit(pnpmResult.status ?? 1);
}

let parsed;
try {
  parsed = JSON.parse(pnpmResult.stdout);
} catch (error) {
  console.error("[licenses] failed to parse pnpm JSON output");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
  console.error("[licenses] unexpected JSON structure from pnpm licenses list");
  process.exit(1);
}

const LICENSE_FILE_CANDIDATES = [
  "LICENSE",
  "LICENSE.md",
  "LICENSE.txt",
  "LICENSE-MIT",
  "LICENCE",
  "LICENCE.md",
  "LICENCE.txt",
  "COPYING",
  "COPYING.md",
  "COPYING.txt",
];

function toPosix(filePath) {
  return filePath.replaceAll("\\", "/");
}

function detectLicenseFile(packagePath) {
  if (!packagePath || typeof packagePath !== "string") {
    return "";
  }

  for (const candidate of LICENSE_FILE_CANDIDATES) {
    const absolutePath = path.join(packagePath, candidate);
    if (fs.existsSync(absolutePath)) {
      return toPosix(path.relative(rootDir, absolutePath));
    }
  }

  return "";
}

function normalizeString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function escapeCell(value) {
  return String(value).replaceAll("|", String.raw`\|`).replaceAll("\n", " ");
}

const packageMap = new Map();

for (const [licenseGroup, entries] of Object.entries(parsed)) {
  if (!Array.isArray(entries)) {
    continue;
  }

  for (const rawEntry of entries) {
    if (!rawEntry || typeof rawEntry !== "object") {
      continue;
    }

    const name = normalizeString(rawEntry.name);
    const version = normalizeString(rawEntry.version);
    if (!name || !version) {
      continue;
    }

    const key = `${name}@${version}`;
    const license = normalizeString(rawEntry.license, normalizeString(licenseGroup, "UNKNOWN"));
    const homepage = normalizeString(rawEntry.homepage);
    const author = normalizeString(rawEntry.author);
    const packagePath = normalizeString(rawEntry.path);
    const licenseFile = detectLicenseFile(packagePath);

    const previous = packageMap.get(key);
    if (!previous) {
      packageMap.set(key, {
        name,
        version,
        license,
        homepage,
        author,
        licenseFile,
      });
      continue;
    }

    // Keep the richer record when duplicates appear.
    packageMap.set(key, {
      name,
      version,
      license: previous.license || license,
      homepage: previous.homepage || homepage,
      author: previous.author || author,
      licenseFile: previous.licenseFile || licenseFile,
    });
  }
}

const packages = [...packageMap.values()].sort((a, b) => {
  const nameOrder = a.name.localeCompare(b.name);
  if (nameOrder !== 0) {
    return nameOrder;
  }
  return a.version.localeCompare(b.version);
});

if (packages.length === 0) {
  console.error("[licenses] no production dependencies discovered");
  process.exit(1);
}

const summary = new Map();
for (const item of packages) {
  const key = item.license || "UNKNOWN";
  summary.set(key, (summary.get(key) ?? 0) + 1);
}

const summaryRows = [...summary.entries()].sort((a, b) => a[0].localeCompare(b[0]));
const unknownOrMissing = packages.filter((item) => {
  const normalizedLicense = item.license.trim().toUpperCase();
  return normalizedLicense.length === 0 || normalizedLicense === "UNKNOWN" || normalizedLicense === "UNLICENSED";
});
const missingLicenseFiles = packages.filter((item) => item.licenseFile.trim().length === 0);

if (strictMode && unknownOrMissing.length > 0) {
  console.error("[licenses] strict mode failed: found dependencies with unknown/unlicensed metadata");
  for (const dep of unknownOrMissing) {
    console.error(`- ${dep.name}@${dep.version} (${dep.license || "UNKNOWN"})`);
  }
  process.exit(2);
}

const lines = [];
lines.push(
  "# Third-Party Notices / Уведомления о сторонних лицензиях",
  "",
  "This file is auto-generated from workspace production dependencies.",
  "Этот файл автоматически генерируется из production-зависимостей workspace.",
  "Source / Источник: `pnpm licenses list --prod --json`.",
  "",
  `- Total production packages / Всего production-пакетов: ${packages.length}`,
  `- Packages without detected local license file / Пакеты без обнаруженного локального файла лицензии: ${missingLicenseFiles.length}`,
  "",
  "## License Summary / Сводка по лицензиям",
  "",
  "| License | Packages |",
  "| --- | ---: |",
);
for (const [license, count] of summaryRows) {
  lines.push(`| ${escapeCell(license)} | ${count} |`);
}
lines.push(
  "",
  "## Package Inventory / Перечень пакетов",
  "",
  "| Package | Version | License | Homepage | License File | Author |",
  "| --- | --- | --- | --- | --- | --- |",
);
for (const item of packages) {
  lines.push(
    `| ${escapeCell(item.name)} | ${escapeCell(item.version)} | ${escapeCell(item.license || "UNKNOWN")} | ${escapeCell(item.homepage || "-")} | ${escapeCell(item.licenseFile || "-")} | ${escapeCell(item.author || "-")} |`
  );
}
lines.push(
  "",
  "## Compliance Notes / Примечания по соответствию",
  "",
  "- For releases, distribute this file together with `LICENSE` and `NOTICE`.",
  "- Для релизов распространяйте этот файл вместе с `LICENSE` и `NOTICE`.",
  "- Dependencies with `UNKNOWN`/`UNLICENSED` metadata require manual legal review before publication.",
  "- Если у зависимости лицензия `UNKNOWN`/`UNLICENSED`, требуется ручная юридическая проверка перед публикацией.",
  "- Packages without a detected local license file in `node_modules` require manual upstream verification.",
  "- Пакеты без обнаруженного файла лицензии в `node_modules` требуют ручной проверки по upstream-репозиторию.",
  "- Strict check command / Команда strict-проверки: `node scripts/generate-third-party-notices.mjs --strict`.",
  "",
);

const nextContent = `${lines.join("\n")}\n`;

if (checkMode) {
  if (!fs.existsSync(outputPath)) {
    console.error(`[licenses] check failed: ${path.basename(outputPath)} is missing`);
    process.exit(3);
  }

  const current = fs.readFileSync(outputPath, "utf8");
  if (current !== nextContent) {
    console.error(`[licenses] check failed: ${path.basename(outputPath)} is outdated. Regenerate with node scripts/generate-third-party-notices.mjs`);
    process.exit(4);
  }

  console.log(`[licenses] ${path.basename(outputPath)} is up to date`);
  process.exit(0);
}

fs.writeFileSync(outputPath, nextContent, "utf8");
console.log(`[licenses] wrote ${path.relative(rootDir, outputPath)} (${packages.length} packages)`);
