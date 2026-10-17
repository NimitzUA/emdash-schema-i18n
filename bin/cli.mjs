#!/usr/bin/env node
/**
 * CLI for emdash-schema-i18n.
 *
 * Scaffolds and synchronizes admin localization strings from EmDash seeds and schemas.
 *
 * Usage:
 *   npx emdash-schema-i18n extract
 *   npx emdash-schema-i18n extract --clean-seed
 *   npx emdash-schema-i18n extract --seed=seed/seed.json --out=src/i18n/admin.ts
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
  --out=<path>         Path to output TS/JS dictionary (default: src/i18n/admin.ts)
  --clean-seed         Remove bilingual slashes from the seed file, keeping English
  -h, --help           Show help
`);
	process.exit(0);
}

const cwd = process.cwd();

// Resolve seed path
let seedPath = "";
for (const arg of args) {
	if (arg.startsWith("--seed=")) seedPath = path.resolve(cwd, arg.split("=")[1]);
}
if (!seedPath) {
	const candidates = [
		path.join(cwd, "seed", "seed.json"),
		path.join(cwd, ".emdash", "seed.json"),
		path.join(cwd, "seed.json"),
	];
	seedPath = candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

// Resolve output path
let outPath = "";
for (const arg of args) {
	if (arg.startsWith("--out=")) outPath = path.resolve(cwd, arg.split("=")[1]);
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

// Load existing translations if present
let existingTranslations = {};
if (fs.existsSync(outPath)) {
	try {
		const existingContent = fs.readFileSync(outPath, "utf-8");
		const matches = existingContent.matchAll(/("((?:[^"\\]|\\.)+)")\s*:\s*("((?:[^"\\]|\\.)*)")/g);
		for (const match of matches) {
			try {
				const key = JSON.parse(match[1]);
				const val = JSON.parse(match[3]);
				existingTranslations[key] = val;
			} catch {
				const key = match[2].replace(/\\"/g, '"');
				const val = match[4].replace(/\\"/g, '"');
				existingTranslations[key] = val;
			}
		}
	} catch (err) {
		console.warn("Notice: Could not parse existing translation file, starting fresh:", err.message);
	}
}

const extracted = new Map();

function processString(str, parentObj, key) {
	if (typeof str !== "string" || !str.trim()) return str;

	if (str.includes(" / ")) {
		const parts = str.split(" / ");
		const uk = parts[0].trim();
		const en = parts.slice(1).join(" / ").trim();

		if (!extracted.has(en) || !extracted.get(en)) {
			extracted.set(en, existingTranslations[en] || uk);
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

// 3. Process Menus
if (Array.isArray(seed.menus)) {
	for (const menu of seed.menus) {
		if (menu && typeof menu === "object" && typeof menu.name === "string") {
			processString(menu.name, menu, "name");
		}
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
	const ukVal = extracted.get(enKey);
	if (ukVal) {
		translatedCount++;
		return `\t\t${JSON.stringify(enKey)}: ${JSON.stringify(ukVal)},`;
	} else {
		untranslatedCount++;
		return `\t\t${JSON.stringify(enKey)}: "", // TODO: translate`;
	}
});

const isJson = outPath.endsWith(".json");
let fileContent = "";

if (isJson) {
	const jsonObj = { uk: {} };
	for (const key of sortedKeys) {
		jsonObj.uk[key] = extracted.get(key) || "";
	}
	fileContent = JSON.stringify(jsonObj, null, 2) + "\n";
} else {
	fileContent = `// Generated and managed by emdash-schema-i18n CLI
// Run "npx emdash-schema-i18n extract" after updating schema or block types.

export const adminDictionary: Record<string, Record<string, string>> = {
	uk: {
${dictLines.join("\n")}
	},
};

export type AdminLocale = keyof typeof adminDictionary;
export default adminDictionary;
`;
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, fileContent, "utf-8");

console.log(`[emdash-schema-i18n] Updated:      ${outPath}`);
console.log(`[emdash-schema-i18n] Total strings: ${sortedKeys.length}`);
console.log(`[emdash-schema-i18n] Translated:    ${translatedCount}`);
if (untranslatedCount > 0) {
	console.log(`[emdash-schema-i18n] Untranslated:  ${untranslatedCount} (marked with TODO)`);
} else {
	console.log(`[emdash-schema-i18n] All strings are translated!`);
}
