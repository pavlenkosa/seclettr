import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL = "https://www.unicode.org/Public/emoji/latest/emoji-test.txt";
const OUTPUT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "apps",
  "web",
  "src",
  "components",
  "chat",
  "composer-emoji-data.generated.ts"
);

function slugify(value) {
  const lower = value.toLowerCase().replaceAll("&", " and ");
  let slug = "";
  let previousWasDash = true;
  for (const char of lower) {
    const code = char.codePointAt(0) ?? 0;
    const isLowerAlpha = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;
    if (isLowerAlpha || isDigit) {
      slug += char;
      previousWasDash = false;
      continue;
    }
    if (!previousWasDash) {
      slug += "-";
      previousWasDash = true;
    }
  }
  return slug.endsWith("-") ? slug.slice(0, -1) : slug;
}

function formatLabel(value) {
  return value
    .replaceAll("-", " ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
}

function serialize(value) {
  return JSON.stringify(value, null, 2);
}

const response = await fetch(SOURCE_URL);

if (!response.ok) {
  throw new Error(`Failed to fetch ${SOURCE_URL}: ${response.status} ${response.statusText}`);
}

const sourceText = await response.text();
const sourceLines = sourceText.split(/\r?\n/);

let unicodeVersion = "unknown";
let publishedAt = "unknown";
let currentGroup = null;
let currentSubgroup = null;
const groups = [];

for (const line of sourceLines) {
  if (line.startsWith("# Version: ")) {
    unicodeVersion = line.slice("# Version: ".length).trim();
    continue;
  }

  if (line.startsWith("# Date: ")) {
    publishedAt = line.slice("# Date: ".length).trim();
    continue;
  }

  if (line.startsWith("# group: ")) {
    currentGroup = {
      id: slugify(line.slice("# group: ".length).trim()),
      label: line.slice("# group: ".length).trim(),
      subgroups: [],
    };
    groups.push(currentGroup);
    currentSubgroup = null;
    continue;
  }

  if (line.startsWith("# subgroup: ")) {
    if (!currentGroup) {
      throw new Error(`Subgroup declared before group: ${line}`);
    }

    currentSubgroup = {
      id: slugify(line.slice("# subgroup: ".length).trim()),
      label: formatLabel(line.slice("# subgroup: ".length).trim()),
      items: [],
    };
    currentGroup.subgroups.push(currentSubgroup);
    continue;
  }

  if (!line || line.startsWith("#")) {
    continue;
  }

  if (!currentGroup || !currentSubgroup) {
    continue;
  }

  const [leftPart, commentPart] = line.split("#");
  if (!leftPart || !commentPart) {
    continue;
  }

  const [, rawStatus = ""] = leftPart.split(";");
  const status = rawStatus.trim();
  if (status !== "fully-qualified") {
    continue;
  }

  const commentParts = commentPart.trim().split(/\s+/);
  const emoji = commentParts[0];
  const name = commentParts.slice(2).join(" ");

  currentSubgroup.items.push([emoji, name]);
}

const output = `/* eslint-disable */
/* prettier-ignore */
/*
 * Generated from ${SOURCE_URL}
 * Unicode Emoji Version: ${unicodeVersion}
 * Published: ${publishedAt}
 * Do not edit manually. Re-run scripts/generate-composer-emoji-data.mjs.
 */

export type GeneratedComposerEmojiTuple = readonly [emoji: string, name: string];

export interface GeneratedComposerEmojiSubgroupData {
  id: string;
  label: string;
  items: readonly GeneratedComposerEmojiTuple[];
}

export interface GeneratedComposerEmojiGroupData {
  id: string;
  label: string;
  subgroups: readonly GeneratedComposerEmojiSubgroupData[];
}

export const GENERATED_COMPOSER_EMOJI_VERSION = ${serialize(unicodeVersion)};
export const GENERATED_COMPOSER_EMOJI_PUBLISHED_AT = ${serialize(publishedAt)};
export const GENERATED_COMPOSER_EMOJI_GROUPS: readonly GeneratedComposerEmojiGroupData[] = ${serialize(groups)} as const;
`;

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, output, "utf8");

console.log(`Generated ${OUTPUT_PATH}`);
