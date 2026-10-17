import test from "node:test";
import assert from "node:assert/strict";
import {
	localizeString,
	localizeManifest,
	localizeBlockTypesResponse,
	localizeCollectionsResponse,
	resolveAdminLocale,
} from "../src/localizer.mjs";

test("resolveAdminLocale extracts locale correctly", () => {
	// 1. From query param
	const reqWithQuery = new Request("http://localhost:4321/_emdash/api/manifest?locale=uk");
	assert.equal(resolveAdminLocale(reqWithQuery), "uk");

	// 2. From cookie
	const reqWithCookie = new Request("http://localhost:4321/_emdash/api/manifest", {
		headers: { cookie: "other=1; emdash-locale=uk-UA; foo=bar" },
	});
	assert.equal(resolveAdminLocale(reqWithCookie), "uk");

	// 3. From Accept-Language
	const reqWithHeader = new Request("http://localhost:4321/_emdash/api/manifest", {
		headers: { "accept-language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7" },
	});
	assert.equal(resolveAdminLocale(reqWithHeader), "uk");

	// 4. Default fallback
	const reqEmpty = new Request("http://localhost:4321/_emdash/api/manifest");
	assert.equal(resolveAdminLocale(reqEmpty, "en"), "en");
});

test("localizeString splits bilingual strings", () => {
	const sample = "Кейси / Case studies";
	assert.equal(localizeString(sample, "uk"), "Кейси");
	assert.equal(localizeString(sample, "en"), "Case studies");

	const fieldSample = "Видимість (public — відкрито, private — приватно) / Visibility";
	assert.equal(localizeString(fieldSample, "uk"), "Видимість (public — відкрито, private — приватно)");
	assert.equal(localizeString(fieldSample, "en"), "Visibility");

	// Untranslated strings stay intact
	assert.equal(localizeString("Slug", "uk"), "Slug");
});

test("localizeString supports dictionary override", () => {
	const sample = "Кейси / Case studies";
	const dict = {
		uk: {
			"test.key": "Спеціальні Кейси",
			"Pure English Label": "Чистий український переклад",
		},
		en: { "test.key": "Special Case Studies" },
	};

	assert.equal(localizeString(sample, "uk", { key: "test.key", dictionary: dict }), "Спеціальні Кейси");
	assert.equal(localizeString(sample, "en", { key: "test.key", dictionary: dict }), "Special Case Studies");

	// Direct phrase lookup without key
	assert.equal(localizeString("Pure English Label", "uk", { dictionary: dict }), "Чистий український переклад");
});

test("localizeManifest transforms collections, fields, and block types", () => {
	const mockManifest = {
		version: "0.1.0",
		collections: {
			case_study: {
				label: "Кейси / Case studies",
				labelSingular: "Кейс / Case study",
				description: "Опис кейсів / Description of case studies",
				fields: {
					title: {
						label: "Заголовок / Title",
						description: "Введіть заголовок / Enter title",
						type: "string",
					},
					visibility: {
						label: "Видимість / Visibility",
						type: "select",
						options: [
							{ value: "public", label: "Публічний / Public" },
							{ value: "private", label: "Приватний / Private" },
						],
					},
					blocks: {
						label: "Блоки / Blocks",
						kind: "blocks",
						blockTypes: [
							{
								slug: "quote",
								label: "Quote",
								versions: [
									{
										fields: [
											{ slug: "attribution", label: "Attribution" },
										],
									},
								],
							},
						],
					},
				},
			},
		},
		blockTypes: [
			{
				type: "before_after",
				label: "До/після / Before and after",
				fields: [
					{
						slug: "caption",
						label: "Підпис / Caption",
					},
				],
			},
		],
	};

	// 1. Ukrainian localization
	const ukManifest = localizeManifest(mockManifest, "uk");
	assert.equal(ukManifest.collections.case_study.label, "Кейси");
	assert.equal(ukManifest.collections.case_study.labelSingular, "Кейс");
	assert.equal(ukManifest.collections.case_study.description, "Опис кейсів");
	assert.equal(ukManifest.collections.case_study.fields.title.label, "Заголовок");
	assert.equal(ukManifest.collections.case_study.fields.title.description, "Введіть заголовок");
	assert.equal(ukManifest.collections.case_study.fields.visibility.options[0].label, "Публічний");
	assert.equal(ukManifest.blockTypes[0].label, "До/після");
	assert.equal(ukManifest.blockTypes[0].fields[0].label, "Підпис");

	// Blocks field blockTypes
	const dict = { uk: { Quote: "Цитата", Attribution: "Підпис автора" } };
	const ukManifestWithDict = localizeManifest(mockManifest, "uk", { dictionary: dict });
	assert.equal(ukManifestWithDict.collections.case_study.fields.blocks.blockTypes[0].label, "Цитата");
	assert.equal(
		ukManifestWithDict.collections.case_study.fields.blocks.blockTypes[0].versions[0].fields[0].label,
		"Підпис автора"
	);

	// 2. English localization
	const enManifest = localizeManifest(mockManifest, "en");
	assert.equal(enManifest.collections.case_study.label, "Case studies");
	assert.equal(enManifest.collections.case_study.labelSingular, "Case study");
	assert.equal(enManifest.collections.case_study.description, "Description of case studies");
	assert.equal(enManifest.collections.case_study.fields.title.label, "Title");
	assert.equal(enManifest.collections.case_study.fields.title.description, "Enter title");
	assert.equal(enManifest.collections.case_study.fields.visibility.options[0].label, "Public");
	assert.equal(enManifest.blockTypes[0].label, "Before and after");
	assert.equal(enManifest.blockTypes[0].fields[0].label, "Caption");

	// 3. Wrapped { success: true, data: { collections: ... } } envelope
	const wrappedResponse = { success: true, data: mockManifest };
	const localizedWrappedUk = localizeManifest(wrappedResponse, "uk");
	assert.equal(localizedWrappedUk.success, true);
	assert.equal(localizedWrappedUk.data.collections.case_study.label, "Кейси");

	const localizedWrappedEn = localizeManifest(wrappedResponse, "en");
	assert.equal(localizedWrappedEn.success, true);
	assert.equal(localizedWrappedEn.data.collections.case_study.label, "Case studies");
});

test("localizeBlockTypesResponse localizes block types in API response", () => {
	const mockApi = {
		success: true,
		data: {
			items: [
				{
					slug: "callout",
					label: "Disclaimer",
					description: "Important notice",
					category: "Text",
				},
			],
		},
	};
	const dict = {
		uk: {
			Disclaimer: "Дисклеймер",
			"Important notice": "Важливе повідомлення",
			Text: "Текст",
		},
	};

	const localizedUk = localizeBlockTypesResponse(mockApi, "uk", { dictionary: dict });
	assert.equal(localizedUk.data.items[0].label, "Дисклеймер");
	assert.equal(localizedUk.data.items[0].description, "Важливе повідомлення");
	assert.equal(localizedUk.data.items[0].category, "Текст");

	const localizedEn = localizeBlockTypesResponse(mockApi, "en", { dictionary: dict });
	assert.equal(localizedEn.data.items[0].label, "Disclaimer");
});

test("localizeCollectionsResponse localizes collections in API response", () => {
	const mockApi = {
		success: true,
		data: {
			items: [
				{
					slug: "case_study",
					label: "Case studies",
					labelSingular: "Case study",
				},
			],
		},
	};
	const dict = {
		uk: {
			"Case studies": "Кейси",
			"Case study": "Кейс",
		},
	};

	const localizedUk = localizeCollectionsResponse(mockApi, "uk", { dictionary: dict });
	assert.equal(localizedUk.data.items[0].label, "Кейси");
	assert.equal(localizedUk.data.items[0].labelSingular, "Кейс");
});


