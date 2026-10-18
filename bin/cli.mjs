#!/usr/bin/env node
/**
 * CLI for emdash-schema-i18n.
 *
 * Scaffolds, synchronizes, and verifies admin localization strings from EmDash seeds and schemas.
 *
 * Usage:
 *   npx emdash-schema-i18n extract
 *   npx emdash-schema-i18n extract --clean-seed
 *   npx emdash-schema-i18n extract --locales=uk,de --seed=seed/seed.json --out=src/i18n/admin.ts
 *   npx emdash-schema-i18n extract --check --locales=uk,de
 */

import fs from "node:fs";
import path from "node:path";
import {
	extractSeedStrings,
	assertDictionaryCovers,
} from "../src/localizer.mjs";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
	console.log(`
Usage: emdash-schema-i18n [command] [options]

Commands:
  extract                Scaffold/update translation dictionary from schema (default)

Options:
  --seed=<path>          Path to seed file (default: seed/seed.json or .emdash/seed.json)
  --out=<path>           Path to output TS/JS/JSON dictionary (default: src/i18n/admin.ts)
  --locale=<code>        Target locale code to scaffold (default: uk)
  --locales=<c1,c2,...>  Comma-separated list of target locales (e.g. --locales uk,de)
  --clean-seed           Remove bilingual slashes from the seed file, keeping English
  --check                Verify that all seed strings are translated in the dictionary (CI mode)
  -h, --help             Show help
`);
	process.exit(0);
}

const cwd = process.cwd();

let seedPath = "";
let outPath = "";
let localesRaw = "";
let cleanSeed = false;
let checkOnly = false;

for (let i = 0; i < args.length; i++) {
	const arg = args[i];
	if (arg.startsWith("--seed=")) {
		seedPath = path.resolve(cwd, arg.slice("--seed=".length));
	} else if (arg === "--seed" && i + 1 < args.length) {
		seedPath = path.resolve(cwd, args[++i]);
	} else if (arg.startsWith("--out=")) {
		outPath = path.resolve(cwd, arg.slice("--out=".length));
	} else if (arg === "--out" && i + 1 < args.length) {
		outPath = path.resolve(cwd, args[++i]);
	} else if (arg.startsWith("--locales=")) {
		localesRaw = arg.slice("--locales=".length).trim();
	} else if (arg === "--locales" && i + 1 < args.length) {
		localesRaw = args[++i].trim();
	} else if (arg.startsWith("--locale=")) {
		localesRaw = arg.slice("--locale=".length).trim();
	} else if (arg === "--locale" && i + 1 < args.length) {
		localesRaw = args[++i].trim();
	} else if (arg === "--clean-seed") {
		cleanSeed = true;
	} else if (arg === "--check") {
		checkOnly = true;
	} else if (arg === "-h" || arg === "--help") {
		continue;
	} else if (arg.startsWith("-")) {
		console.error(`Error: Unknown option "${arg}". Run with --help for usage.`);
		process.exit(1);
	} else if (arg !== "extract") {
		console.error(`Error: Unknown command "${arg}". Supported commands: extract.`);
		process.exit(1);
	}
}

const targetLocales = (localesRaw ? localesRaw.split(",") : ["uk"])
	.map((l) => l.trim())
	.filter(Boolean);

if (targetLocales.length === 0) {
	targetLocales.push("uk");
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
		existingMultiLocaleDict = parseExistingDictionary(
			existingContent,
			targetLocales[0],
		);
	} catch (err) {
		console.warn(
			"Notice: Could not parse existing translation file, starting fresh:",
			err.message,
		);
	}
} else if (checkOnly) {
	console.error(
		`[emdash-schema-i18n] Error: Dictionary file not found at ${outPath}`,
	);
	process.exit(1);
}

// CI check mode: verify all seed strings have non-empty translations in targetLocales
if (checkOnly) {
	try {
		const result = assertDictionaryCovers(
			seed,
			existingMultiLocaleDict,
			targetLocales,
		);
		console.log(
			`[emdash-schema-i18n] Dictionary check passed (${result.keys.length} strings covered across locales: ${result.locales.join(", ")}).`,
		);
		process.exit(0);
	} catch (err) {
		console.error(err.message || String(err));
		process.exit(1);
	}
}

const knownExistingPhrases = new Set();
for (const localeMap of Object.values(existingMultiLocaleDict)) {
	if (localeMap && typeof localeMap === "object") {
		for (const phrase of Object.keys(localeMap)) {
			knownExistingPhrases.add(phrase);
		}
	}
}

const { keys: extractedKeys, inlineTranslations } = extractSeedStrings(seed, {
	cleanSeed,
	knownPhrases: knownExistingPhrases,
});

// Save cleaned seed if requested
if (cleanSeed) {
	fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2) + "\n", "utf-8");
	console.log(
		`[emdash-schema-i18n] Cleaned seed file at ${seedPath} (removed bilingual slashes)`,
	);
}

// Build merged dictionary for all targetLocales (and preserve any other existing locales)
const primaryInlineLocale = targetLocales.includes("uk")
	? "uk"
	: targetLocales[0];

/** @type {Record<string, Map<string, string>>} */
const localeMaps = {};
let totalTranslatedCount = 0;
let totalUntranslatedCount = 0;

for (const loc of targetLocales) {
	const existingForLoc = existingMultiLocaleDict[loc] || {};
	const map = new Map();

	for (const enKey of extractedKeys) {
		const existingVal = existingForLoc[enKey];
		if (typeof existingVal === "string" && existingVal.length > 0) {
			map.set(enKey, existingVal);
		} else if (loc === primaryInlineLocale && inlineTranslations.has(enKey)) {
			map.set(enKey, inlineTranslations.get(enKey) || "");
		} else {
			map.set(enKey, "");
		}
	}

	// Preserve any custom/manual keys already present in this locale's dictionary
	for (const [existingKey, existingVal] of Object.entries(existingForLoc)) {
		if (!map.has(existingKey) && existingVal) {
			map.set(existingKey, existingVal);
		}
	}

	localeMaps[loc] = map;
}

const isJson = outPath.endsWith(".json");
let fileContent = "";

if (isJson) {
	const jsonObj = { ...existingMultiLocaleDict };
	for (const loc of targetLocales) {
		const map = localeMaps[loc];
		const sortedKeys = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
		jsonObj[loc] = {};
		for (const key of sortedKeys) {
			const val = map.get(key) || "";
			if (val) totalTranslatedCount++;
			else totalUntranslatedCount++;
			jsonObj[loc][key] = val;
		}
	}
	fileContent = JSON.stringify(jsonObj, null, 2) + "\n";
} else {
	const allBlocks = [];

	for (const loc of targetLocales) {
		const map = localeMaps[loc];
		const sortedKeys = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
		const dictLines = sortedKeys.map((enKey) => {
			const localizedVal = map.get(enKey);
			if (localizedVal) {
				totalTranslatedCount++;
				return `\t\t${JSON.stringify(enKey)}: ${JSON.stringify(localizedVal)},`;
			}
			totalUntranslatedCount++;
			return `\t\t${JSON.stringify(enKey)}: "", // TODO: translate`;
		});
		const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(loc)
			? loc
			: JSON.stringify(loc);
		allBlocks.push(`\t${safeKey}: {\n${dictLines.join("\n")}\n\t},`);
	}

	// Preserve any other locale blocks that were already in the file but not in targetLocales
	for (const [loc, entries] of Object.entries(existingMultiLocaleDict)) {
		if (
			targetLocales.includes(loc) ||
			!entries ||
			typeof entries !== "object"
		) {
			continue;
		}
		const lines = Object.keys(entries)
			.sort((a, b) => a.localeCompare(b))
			.map((k) => `\t\t${JSON.stringify(k)}: ${JSON.stringify(entries[k])},`);
		const safeLocKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(loc)
			? loc
			: JSON.stringify(loc);
		allBlocks.push(`\t${safeLocKey}: {\n${lines.join("\n")}\n\t},`);
	}

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

console.log(
	`[emdash-schema-i18n] Updated:      ${outPath} (locales: ${targetLocales.join(", ")})`,
);
console.log(`[emdash-schema-i18n] Total strings: ${extractedKeys.length}`);
console.log(`[emdash-schema-i18n] Translated:    ${totalTranslatedCount}`);
if (totalUntranslatedCount > 0) {
	console.log(
		`[emdash-schema-i18n] Untranslated:  ${totalUntranslatedCount} (marked with TODO)`,
	);
} else {
	console.log(`[emdash-schema-i18n] All strings are translated!`);
}
