#!/usr/bin/env node
/**
 * CLI for emdash-schema-i18n.
 *
 * Scaffolds and synchronizes admin localization strings from EmDash seeds and schemas.
 *
 * Usage:
 *   npx emdash-schema-i18n extract
 *   npx emdash-schema-i18n extract --clean-seed
 *   npx emdash-schema-i18n extract --locale=uk --seed=seed/seed.json --out=src/i18n/admin.ts
 */

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
	console.log(`
Usage: emdash-schema-i18n [command] [options]

Commands:
  extract              Scaffold/update translation dictionary from schema (default)

Options:
  --seed=<path>        Path to seed file (default: seed/seed.json or .emdash/seed.json)
  --out=<path>         Path to output TS/JS/JSON dictionary (default: src/i18n/admin.ts)
  --locale=<code>      Target locale code to scaffold (default: uk)
  --clean-seed         Remove bilingual slashes from the seed file, keeping English
  -h, --help           Show help
`);
	process.exit(0);
}

const cwd = process.cwd();

// Resolve seed path
let seedPath = "";
let outPath = "";
let targetLocale = "uk";

for (const arg of args) {
	if (arg.startsWith("--seed=")) seedPath = path.resolve(cwd, arg.split("=")[1]);
	else if (arg.startsWith("--out=")) outPath = path.resolve(cwd, arg.split("=")[1]);
	else if (arg.startsWith("--locale=")) targetLocale = arg.split("=")[1].trim() || "uk";
}

if (!seedPath) {
	const candidates = [
		path.join(cwd, "seed", "seed.json"),
		path.join(cwd, ".emdash", "seed.json"),
		path.join(cwd, "seed.json"),
	];
	seedPath = candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

if (!outPath) {
	outPath = path.join(cwd, "src", "i18n", "admin.ts");
}

const cleanSeed = args.includes("--clean-seed");

if (!fs.existsSync(seedPath)) {
	console.error(`Error: Seed file not found at ${seedPath}`);
	process.exit(1);
}

console.log(`[emdash-schema-i18n] Reading schema from: ${seedPath}`);

const seedContent = fs.readFileSync(seedPath, "utf-8");
const seed = JSON.parse(seedContent);

/**
 * Parses an existing TS/JS/JSON dictionary file into a multi-locale map:
 * `{ [locale]: Record<string, string> }`
 *
 * @param {string} content
 * @param {string} defaultTargetLocale
 * @returns {Record<string, Record<string, string>>}
 */
function parseExistingDictionary(content, defaultTargetLocale) {
	const trimmed = content.trim();
	if (trimmed.startsWith("{")) {
		try {
			const parsed = JSON.parse(trimmed);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				return parsed;
			}
		} catch {
			// Fall back to regex parser below
		}
	}

	const result = {};
	// Match locale blocks like `uk: { ... }` or `"uk": { ... }`
	const blockRegex = /(?:^|[,{\s])(?:"([a-zA-Z0-9_-]+)"|([a-zA-Z0-9_-]+))\s*:\s*\{([^{}]*)\}/gm;
	let foundBlocks = false;

	for (const blockMatch of content.matchAll(blockRegex)) {
		const localeKey = blockMatch[1] || blockMatch[2];
		const blockBody = blockMatch[3] || "";
		if (!localeKey) continue;
		foundBlocks = true;
		result[localeKey] = parseKeyValuePairs(blockBody);
	}

	if (!foundBlocks) {
		result[defaultTargetLocale] = parseKeyValuePairs(content);
	}

	return result;
}

function parseKeyValuePairs(text) {
	const entries = {};
	const matches = text.matchAll(/("((?:[^"\\]|\\.)+)")\s*:\s*("((?:[^"\\]|\\.)*)")/g);
	for (const match of matches) {
		try {
			const key = JSON.parse(match[1]);
			const val = JSON.parse(match[3]);
			entries[key] = val;
		} catch {
			const key = match[2].replace(/\\"/g, '"');
			const val = match[4].replace(/\\"/g, '"');
			entries[key] = val;
		}
	}
	return entries;
}

// Load existing translations if present
let existingMultiLocaleDict = {};
if (fs.existsSync(outPath)) {
	try {
		const existingContent = fs.readFileSync(outPath, "utf-8");
		existingMultiLocaleDict = parseExistingDictionary(existingContent, targetLocale);
	} catch (err) {
		console.warn("Notice: Could not parse existing translation file, starting fresh:", err.message);
	}
}

const existingTranslations = existingMultiLocaleDict[targetLocale] || {};
const extracted = new Map();

function processString(str, parentObj, key) {
	if (typeof str !== "string" || !str.trim()) return str;

	if (str.includes(" / ")) {
		const parts = str.split(" / ");
		const firstPart = parts[0].trim();
		const en = parts.slice(1).join(" / ").trim();

		if (!extracted.has(en) || !extracted.get(en)) {
			extracted.set(en, existingTranslations[en] || firstPart);
		}

		if (cleanSeed && parentObj && key !== undefined) {
			parentObj[key] = en;
		}
		return en;
	} else {
		const trimmed = str.trim();
		if (!extracted.has(trimmed)) {
			extracted.set(trimmed, existingTranslations[trimmed] || "");
		}
		return trimmed;
	}
}

const TARGET_KEYS = new Set([
	"label",
	"labelSingular",
	"description",
	"category",
	"group",
	"placeholder",
	"hint",
]);

function deepWalk(val, parentKey = "") {
	if (!val) return;
	if (Array.isArray(val)) {
		for (let i = 0; i < val.length; i++) {
			const item = val[i];
			if (typeof item === "string" && (item.includes(" / ") || parentKey === "options")) {
				val[i] = processString(item, val, i);
			} else if (item && typeof item === "object") {
				deepWalk(item, parentKey);
			}
		}
	} else if (typeof val === "object") {
		for (const [k, v] of Object.entries(val)) {
			if (TARGET_KEYS.has(k) && typeof v === "string") {
				processString(v, val, k);
			} else if (typeof v === "object") {
				deepWalk(v, k);
			}
		}
	}
}

// 1. Process Block Types
if (Array.isArray(seed.blockTypes)) {
	deepWalk(seed.blockTypes);
}

// 2. Process Collections
if (Array.isArray(seed.collections)) {
	deepWalk(seed.collections);
} else if (seed.collections && typeof seed.collections === "object") {
	deepWalk(seed.collections);
}

// 3. Process Taxonomies
if (Array.isArray(seed.taxonomies)) {
	deepWalk(seed.taxonomies);
}

// 4. Process Menus
if (Array.isArray(seed.menus)) {
	for (const menu of seed.menus) {
		if (menu && typeof menu === "object" && typeof menu.name === "string") {
			processString(menu.name, menu, "name");
		}
	}
}

// Preserve any custom/manual keys already present in targetLocale dictionary
for (const [existingKey, existingVal] of Object.entries(existingTranslations)) {
	if (!extracted.has(existingKey) && existingVal) {
		extracted.set(existingKey, existingVal);
	}
}

// Save cleaned seed if requested
if (cleanSeed) {
	fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2) + "\n", "utf-8");
	console.log(`[emdash-schema-i18n] Cleaned seed file at ${seedPath} (removed bilingual slashes)`);
}

// Generate output file
const sortedKeys = Array.from(extracted.keys()).sort((a, b) => a.localeCompare(b));
let translatedCount = 0;
let untranslatedCount = 0;

const dictLines = sortedKeys.map((enKey) => {
	const localizedVal = extracted.get(enKey);
	if (localizedVal) {
		translatedCount++;
		return `\t\t${JSON.stringify(enKey)}: ${JSON.stringify(localizedVal)},`;
	} else {
		untranslatedCount++;
		return `\t\t${JSON.stringify(enKey)}: "", // TODO: translate`;
	}
});

const isJson = outPath.endsWith(".json");
let fileContent = "";

if (isJson) {
	const jsonObj = { ...existingMultiLocaleDict, [targetLocale]: {} };
	for (const key of sortedKeys) {
		jsonObj[targetLocale][key] = extracted.get(key) || "";
	}
	fileContent = JSON.stringify(jsonObj, null, 2) + "\n";
} else {
	const otherLocaleBlocks = [];
	for (const [loc, entries] of Object.entries(existingMultiLocaleDict)) {
		if (loc === targetLocale || !entries || typeof entries !== "object") continue;
		const lines = Object.entries(entries).map(
			([k, v]) => `\t\t${JSON.stringify(k)}: ${JSON.stringify(v)},`,
		);
		const safeLocKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(loc) ? loc : JSON.stringify(loc);
		otherLocaleBlocks.push(`\t${safeLocKey}: {\n${lines.join("\n")}\n\t},`);
	}

	const safeTargetKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(targetLocale)
		? targetLocale
		: JSON.stringify(targetLocale);

	const allBlocks = [
		`\t${safeTargetKey}: {\n${dictLines.join("\n")}\n\t},`,
		...otherLocaleBlocks,
	];

	fileContent = `// Generated and managed by emdash-schema-i18n CLI
// Run "npx emdash-schema-i18n extract" after updating schema or block types.

export const adminDictionary: Record<string, Record<string, string>> = {
${allBlocks.join("\n")}
};

export type AdminLocale = keyof typeof adminDictionary;
export default adminDictionary;
`;
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, fileContent, "utf-8");

console.log(`[emdash-schema-i18n] Updated:      ${outPath} (locale: ${targetLocale})`);
console.log(`[emdash-schema-i18n] Total strings: ${sortedKeys.length}`);
console.log(`[emdash-schema-i18n] Translated:    ${translatedCount}`);
if (untranslatedCount > 0) {
	console.log(`[emdash-schema-i18n] Untranslated:  ${untranslatedCount} (marked with TODO)`);
} else {
	console.log(`[emdash-schema-i18n] All strings are translated!`);
}
