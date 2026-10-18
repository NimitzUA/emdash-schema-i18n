import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cliPath = path.resolve("bin/cli.mjs");

test("CLI --help displays usage", async () => {
	const { stdout } = await execFileAsync("node", [cliPath, "--help"]);
	assert.ok(stdout.includes("Usage: emdash-schema-i18n"));
	assert.ok(stdout.includes("extract"));
	assert.ok(stdout.includes("--clean-seed"));
	assert.ok(stdout.includes("--locales"));
	assert.ok(stdout.includes("--check"));
});

test("CLI errors gracefully if seed file is missing", async () => {
	try {
		await execFileAsync("node", [cliPath, "extract", "--seed=non_existent_seed_123.json"]);
		assert.fail("CLI should have exited with non-zero exit code");
	} catch (err) {
		assert.equal(err.code, 1);
		assert.ok(err.stderr.includes("Error: Seed file not found"));
	}
});

test("CLI extract parses bilingual strings and generates admin.ts", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "emdash-cli-test-"));
	const seedPath = path.join(tmpDir, "seed.json");
	const outPath = path.join(tmpDir, "admin.ts");

	const sampleSeed = {
		version: "1",
		collections: [
			{
				slug: "case_studies",
				label: "Кейси / Case studies",
				labelSingular: "Кейс / Case study",
				fields: [
					{ slug: "title", label: "Заголовок / Title" },
					{ slug: "content", label: "Content" },
				],
			},
		],
		blockTypes: [
			{
				slug: "quote",
				label: "Цитата / Quote",
				category: "Текст / Text",
				versions: [
					{
						version: 1,
						fields: [{ slug: "attribution", label: "Підпис автора / Attribution" }],
					},
				],
			},
		],
	};

	fs.writeFileSync(seedPath, JSON.stringify(sampleSeed, null, 2), "utf-8");

	const { stdout } = await execFileAsync("node", [
		cliPath,
		"extract",
		`--seed=${seedPath}`,
		`--out=${outPath}`,
	]);

	assert.ok(stdout.includes("Total strings:"));
	assert.ok(fs.existsSync(outPath));

	const generatedTs = fs.readFileSync(outPath, "utf-8");
	assert.ok(generatedTs.includes('"Case studies": "Кейси"'));
	assert.ok(generatedTs.includes('"Case study": "Кейс"'));
	assert.ok(generatedTs.includes('"Title": "Заголовок"'));
	assert.ok(generatedTs.includes('"Quote": "Цитата"'));
	assert.ok(generatedTs.includes('"Text": "Текст"'));
	assert.ok(generatedTs.includes('"Attribution": "Підпис автора"'));
	assert.ok(generatedTs.includes('"Content": "", // TODO: translate'));

	// Seed file must not be modified when --clean-seed is not specified
	const rawSeedAfter = JSON.parse(fs.readFileSync(seedPath, "utf-8"));
	assert.equal(rawSeedAfter.collections[0].label, "Кейси / Case studies");

	fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("CLI extract --clean-seed strips bilingual slashes in place", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "emdash-cli-test-"));
	const seedPath = path.join(tmpDir, "seed.json");
	const outPath = path.join(tmpDir, "admin.ts");

	const sampleSeed = {
		version: "1",
		collections: [
			{
				slug: "articles",
				label: "Статті / Articles",
				labelSingular: "Стаття / Article",
				fields: [{ slug: "title", label: "Заголовок / Title" }],
			},
		],
		blockTypes: [
			{
				slug: "hero",
				label: "Банер / Hero Banner",
				category: "Макет / Layout",
			},
		],
	};

	fs.writeFileSync(seedPath, JSON.stringify(sampleSeed, null, 2), "utf-8");

	await execFileAsync("node", [
		cliPath,
		"extract",
		`--seed=${seedPath}`,
		`--out=${outPath}`,
		"--clean-seed",
	]);

	// Verify cleaned seed file
	const cleanedSeed = JSON.parse(fs.readFileSync(seedPath, "utf-8"));
	assert.equal(cleanedSeed.collections[0].label, "Articles");
	assert.equal(cleanedSeed.collections[0].labelSingular, "Article");
	assert.equal(cleanedSeed.collections[0].fields[0].label, "Title");
	assert.equal(cleanedSeed.blockTypes[0].label, "Hero Banner");
	assert.equal(cleanedSeed.blockTypes[0].category, "Layout");

	// Verify generated dictionary
	const generatedTs = fs.readFileSync(outPath, "utf-8");
	assert.ok(generatedTs.includes('"Articles": "Статті"'));
	assert.ok(generatedTs.includes('"Article": "Стаття"'));
	assert.ok(generatedTs.includes('"Hero Banner": "Банер"'));
	assert.ok(generatedTs.includes('"Layout": "Макет"'));

	fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("CLI extract preserves existing translations and supports JSON output", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "emdash-cli-test-"));
	const seedPath = path.join(tmpDir, "seed.json");
	const outTsPath = path.join(tmpDir, "admin.ts");
	const outJsonPath = path.join(tmpDir, "admin.json");

	const seed1 = {
		collections: [
			{
				label: "Projects",
				fields: [{ label: "Title" }],
			},
		],
	};
	fs.writeFileSync(seedPath, JSON.stringify(seed1, null, 2), "utf-8");

	// First run
	await execFileAsync("node", [cliPath, "extract", `--seed=${seedPath}`, `--out=${outTsPath}`]);

	// Simulate user filling in translations in admin.ts
	const customAdminTs = `
export const adminDictionary = {
	uk: {
		"Projects": "Проєкти",
		"Title": "Назва",
	},
};
`;
	fs.writeFileSync(outTsPath, customAdminTs, "utf-8");

	// Add new untranslated field to seed
	const seed2 = {
		collections: [
			{
				label: "Projects",
				fields: [
					{ label: "Title" },
					{ label: "Description" },
				],
			},
		],
	};
	fs.writeFileSync(seedPath, JSON.stringify(seed2, null, 2), "utf-8");

	// Second run with TS
	await execFileAsync("node", [cliPath, "extract", `--seed=${seedPath}`, `--out=${outTsPath}`]);
	const updatedTs = fs.readFileSync(outTsPath, "utf-8");
	assert.ok(updatedTs.includes('"Projects": "Проєкти"'));
	assert.ok(updatedTs.includes('"Title": "Назва"'));
	assert.ok(updatedTs.includes('"Description": "", // TODO: translate'));

	// Test JSON output format with existing JSON translations
	const initialJson = {
		uk: {
			Projects: "Проєкти",
			Title: "Назва",
		},
	};
	fs.writeFileSync(outJsonPath, JSON.stringify(initialJson, null, 2), "utf-8");

	await execFileAsync("node", [cliPath, "extract", `--seed=${seedPath}`, `--out=${outJsonPath}`]);
	const jsonContent = JSON.parse(fs.readFileSync(outJsonPath, "utf-8"));
	assert.equal(jsonContent.uk["Projects"], "Проєкти");
	assert.equal(jsonContent.uk["Title"], "Назва");
	assert.equal(jsonContent.uk["Description"], "");

	fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("CLI extract handles escaped characters without double-escaping and extracts menus and string options", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "emdash-cli-test-"));
	const seedPath = path.join(tmpDir, "seed.json");
	const outTsPath = path.join(tmpDir, "admin.ts");

	const seed = {
		collections: [
			{
				label: "Articles",
				fields: [
					{
						slug: "status",
						label: "Status",
						options: ["Draft", "Published"],
					},
				],
			},
		],
		menus: [
			{
				slug: "main",
				name: "Головне меню / Main Menu",
			},
		],
	};
	fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2), "utf-8");

	const initialTs = `export const adminDictionary = {
	uk: {
		"Articles": "Статті з \\"лапками\\"\\nі переносом",
	},
};
`;
	fs.writeFileSync(outTsPath, initialTs, "utf-8");

	// Run extract twice to ensure backslashes and newlines are not double-escaped
	await execFileAsync("node", [cliPath, "extract", `--seed=${seedPath}`, `--out=${outTsPath}`]);
	await execFileAsync("node", [cliPath, "extract", `--seed=${seedPath}`, `--out=${outTsPath}`]);

	const updatedTs = fs.readFileSync(outTsPath, "utf-8");
	assert.ok(updatedTs.includes('"Articles": "Статті з \\"лапками\\"\\nі переносом"'));
	assert.ok(updatedTs.includes('"Main Menu": "Головне меню"'));
	assert.ok(updatedTs.includes('"Draft": ""'));
	assert.ok(updatedTs.includes('"Published": ""'));

	fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("CLI extract supports --locale and --locales uk,de flags and scaffolds all requested locales", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "emdash-cli-test-"));
	const seedPath = path.join(tmpDir, "seed.json");
	const outTsPath = path.join(tmpDir, "admin.ts");

	const seed = {
		collections: [
			{
				label: "Articles",
				group: "Content",
			},
		],
		taxonomies: [
			{
				name: "tags",
				label: "Tags",
				labelSingular: "Tag",
				description: "Ignored taxonomy description",
			},
		],
	};
	fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2), "utf-8");

	const initialTs = `export const adminDictionary = {
	uk: {
		"Articles": "Статті",
	},
	pl: {
		"Articles": "Artykuły",
	},
};
`;
	fs.writeFileSync(outTsPath, initialTs, "utf-8");

	// Scaffold both uk and de via `--locales uk,de` while preserving existing `pl`
	await execFileAsync("node", [
		cliPath,
		"extract",
		"--locales",
		"uk,de",
		`--seed=${seedPath}`,
		`--out=${outTsPath}`,
	]);

	const updatedTs = fs.readFileSync(outTsPath, "utf-8");
	assert.ok(updatedTs.includes("uk: {"));
	assert.ok(updatedTs.includes("de: {"));
	assert.ok(updatedTs.includes("pl: {"));
	assert.ok(updatedTs.includes('"Articles": "Статті"'));
	assert.ok(updatedTs.includes('"Articles": "Artykuły"'));
	assert.ok(!updatedTs.includes('"Ignored taxonomy description"'));

	// Verify both uk and de blocks have all 4 keys ("Articles", "Content", "Tag", "Tags")
	const deBlockMatch = updatedTs.match(/de:\s*\{([^{}]*)\}/m);
	assert.ok(deBlockMatch);
	assert.ok(deBlockMatch[1].includes('"Articles": "", // TODO: translate'));
	assert.ok(deBlockMatch[1].includes('"Content": "", // TODO: translate'));
	assert.ok(deBlockMatch[1].includes('"Tag": "", // TODO: translate'));
	assert.ok(deBlockMatch[1].includes('"Tags": "", // TODO: translate'));

	fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("CLI extract --check exits with 1 when translations are missing and 0 when complete", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "emdash-cli-test-"));
	const seedPath = path.join(tmpDir, "seed.json");
	const outTsPath = path.join(tmpDir, "admin.ts");

	const seed = {
		collections: [
			{
				label: "Projects",
				labelSingular: "Project",
			},
		],
		taxonomies: [
			{
				name: "categories",
				label: "Categories",
			},
		],
	};
	fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2), "utf-8");

	// 1. Run extract --locales=uk,de (scaffolds empty strings)
	await execFileAsync("node", [
		cliPath,
		"extract",
		"--locales=uk,de",
		`--seed=${seedPath}`,
		`--out=${outTsPath}`,
	]);

	// 2. Run --check -> fails with exit code 1 because strings are empty
	await assert.rejects(
		execFileAsync("node", [
			cliPath,
			"extract",
			"--check",
			"--locales=uk,de",
			`--seed=${seedPath}`,
			`--out=${outTsPath}`,
		]),
		(err) => {
			assert.equal(err.code, 1);
			assert.ok(err.stderr.includes("[uk] (3 missing)"));
			assert.ok(err.stderr.includes("[de] (3 missing)"));
			return true;
		},
	);

	// 3. Populate all translations for uk and de
	const fullDictTs = `export const adminDictionary = {
	uk: {
		"Categories": "Категорії",
		"Project": "Проєкт",
		"Projects": "Проєкти",
	},
	de: {
		"Categories": "Kategorien",
		"Project": "Projekt",
		"Projects": "Projekte",
	},
};
`;
	fs.writeFileSync(outTsPath, fullDictTs, "utf-8");

	// 4. Run --check -> passes with exit code 0!
	const { stdout } = await execFileAsync("node", [
		cliPath,
		"extract",
		"--check",
		"--locales=uk,de",
		`--seed=${seedPath}`,
		`--out=${outTsPath}`,
	]);
	assert.ok(stdout.includes("Dictionary check passed"));

	fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("CLI rejects unknown commands and flags with non-zero exit code", async () => {
	await assert.rejects(
		execFileAsync("node", [cliPath, "unknown-cmd"]),
		(err) => {
			assert.equal(err.code, 1);
			assert.ok(err.stderr.includes('Unknown command "unknown-cmd"'));
			return true;
		},
	);

	await assert.rejects(
		execFileAsync("node", [cliPath, "extract", "--unknown-flag"]),
		(err) => {
			assert.equal(err.code, 1);
			assert.ok(err.stderr.includes('Unknown option "--unknown-flag"'));
			return true;
		},
	);
});

test("CLI extract --clean-seed preserves canonical English phrases with slashes and 3+ part strings", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "emdash-cli-test-"));
	const seedPath = path.join(tmpDir, "seed.json");
	const outTsPath = path.join(tmpDir, "admin.ts");

	const initialTs = `export const adminDictionary = {
	uk: {
		"Before / after": "До / після",
	},
};
`;
	fs.writeFileSync(outTsPath, initialTs, "utf-8");

	const seed = {
		collections: [
			{
				label: "Before / after",
				description: "Small / Medium / Large",
			},
		],
	};
	fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2), "utf-8");

	await execFileAsync("node", [
		cliPath,
		"extract",
		`--seed=${seedPath}`,
		`--out=${outTsPath}`,
		"--clean-seed",
	]);

	const cleanedSeed = JSON.parse(fs.readFileSync(seedPath, "utf-8"));
	assert.equal(cleanedSeed.collections[0].label, "Before / after");
	assert.equal(cleanedSeed.collections[0].description, "Small / Medium / Large");

	const updatedTs = fs.readFileSync(outTsPath, "utf-8");
	assert.ok(updatedTs.includes('"Before / after": "До / після"'));
	assert.ok(updatedTs.includes('"Small / Medium / Large": ""'));

	fs.rmSync(tmpDir, { recursive: true, force: true });
});
