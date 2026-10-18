import test from "node:test";
import assert from "node:assert/strict";
import {
	localizeString,
	localizeManifest,
	localizeBlockTypesResponse,
	localizeCollectionsResponse,
	resolveAdminLocale,
	normalizeLocale,
	extractSeedStrings,
	assertDictionaryCovers,
} from "../src/localizer.mjs";

test("resolveAdminLocale extracts locale correctly (strict cookie default, opt-in query & Accept-Language)", () => {
	// 1. Default: ?locale= and Accept-Language are ignored unless opted in
	const reqWithQueryOnly = new Request("http://localhost:4321/_emdash/api/manifest?locale=uk");
	assert.equal(resolveAdminLocale(reqWithQueryOnly), "en");
	assert.equal(
		resolveAdminLocale(reqWithQueryOnly, "en", { allowQueryParam: true }),
		"uk",
	);

	// 2. From cookie (enabled by default)
	const reqWithCookie = new Request("http://localhost:4321/_emdash/api/manifest", {
		headers: { cookie: "other=1; emdash-locale=uk-UA; foo=bar" },
	});
	assert.equal(resolveAdminLocale(reqWithCookie), "uk");

	// 3. From Accept-Language (when useAcceptLanguage: true)
	const reqWithHeader = new Request("http://localhost:4321/_emdash/api/manifest", {
		headers: { "accept-language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7" },
	});
	assert.equal(resolveAdminLocale(reqWithHeader), "en");
	assert.equal(
		resolveAdminLocale(reqWithHeader, "en", { useAcceptLanguage: true }),
		"uk",
	);

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

	// Single item envelope: { item: collection }
	const singleColEnvelope = {
		data: {
			item: {
				slug: "case_study",
				label: "Case studies",
				labelSingular: "Case study",
			},
		},
	};
	const localizedSingleUk = localizeCollectionsResponse(singleColEnvelope, "uk", { dictionary: dict });
	assert.equal(localizedSingleUk.data.item.label, "Кейси");
	assert.equal(localizedSingleUk.data.item.labelSingular, "Кейс");
});

test("localizeString safely ignores Object.prototype keys like constructor and toString", () => {
	const dict = {
		uk: {
			Title: "Заголовок",
		},
	};

	assert.equal(localizeString("constructor", "uk", { dictionary: dict }), "constructor");
	assert.equal(localizeString("toString", "uk", { dictionary: dict }), "toString");
	assert.equal(localizeString("valueOf", "uk", { key: "constructor", dictionary: dict }), "valueOf");
	assert.deepEqual(localizeString({ constructor: "foo" }, "uk", { dictionary: dict }), { constructor: "foo" });
});

test("resolveAdminLocale handles malformed percent-encoded cookies gracefully", () => {
	const reqWithBadCookie = new Request("http://localhost:4321/_emdash/api/manifest", {
		headers: { cookie: "emdash-locale=%E0%A4%A" },
	});
	assert.doesNotThrow(() => resolveAdminLocale(reqWithBadCookie));
});

test("createLocalizationMiddleware injects reload watcher script into admin HTML when injectHtmlWatcher: true", async () => {
	const { createLocalizationMiddleware } = await import("../src/middleware.mjs");
	const middleware = createLocalizationMiddleware({ injectHtmlWatcher: true });

	const mockContext = {
		url: new URL("http://localhost:4321/_emdash/admin/settings"),
		request: new Request("http://localhost:4321/_emdash/admin/settings"),
	};

	const mockNext = async () =>
		new Response("<!doctype html><html><head></head><body><div id='admin-root'></div></body></html>", {
			status: 200,
			headers: { "Content-Type": "text/html; charset=utf-8" },
		});

	const response = await middleware(mockContext, mockNext);
	assert.equal(response.status, 200);
	const text = await response.text();
	assert.ok(text.includes('id="emdash-i18n-watcher"'));
	assert.ok(text.includes("MutationObserver"));
	assert.ok(text.endsWith("</body></html>"));
});

test("localizeManifest localizes collection group, taxonomies, and plugin UI contributions (and respects localizeManifestTaxonomies)", () => {
	const manifest = {
		collections: {
			articles: {
				label: "Articles",
				group: "Editorial",
				fields: {},
			},
		},
		taxonomies: [
			{
				id: "tax_1",
				name: "categories",
				label: "Categories",
				labelSingular: "Category",
			},
		],
		plugins: {
			seo: {
				adminPages: [{ path: "/seo", label: "SEO Settings", group: "Marketing" }],
				dashboardWidgets: [{ id: "stats", title: "Traffic Overview" }],
				fieldWidgets: [{ name: "color", label: "Color Picker" }],
				portableTextBlocks: [{ type: "alert", label: "Alert Box", description: "Warning callout" }],
				editorPanels: [{ id: "seo-panel", label: "SEO Panel", title: "SEO Checklist" }],
				editorActions: [{ id: "publish-seo", label: "Run SEO Audit" }],
			},
		},
	};

	const dict = {
		uk: {
			Articles: "Статті",
			Editorial: "Редакція",
			Categories: "Категорії",
			Category: "Категорія",
			"SEO Settings": "Налаштування SEO",
			Marketing: "Маркетинг",
			"Traffic Overview": "Огляд трафіку",
			"Color Picker": "Вибір кольору",
			"Alert Box": "Блок сповіщення",
			"Warning callout": "Попереджувальна плашка",
			"SEO Panel": "Панель SEO",
			"SEO Checklist": "Чекліст SEO",
			"Run SEO Audit": "Запустити SEO-аудит",
		},
	};

	const localized = localizeManifest(manifest, "uk", { dictionary: dict });
	assert.equal(localized.collections.articles.group, "Редакція");
	assert.equal(localized.taxonomies[0].label, "Категорії");
	assert.equal(localized.taxonomies[0].labelSingular, "Категорія");
	assert.equal(localized.plugins.seo.adminPages[0].label, "Налаштування SEO");
	assert.equal(localized.plugins.seo.adminPages[0].group, "Маркетинг");
	assert.equal(localized.plugins.seo.dashboardWidgets[0].title, "Огляд трафіку");
	assert.equal(localized.plugins.seo.fieldWidgets[0].label, "Вибір кольору");
	assert.equal(localized.plugins.seo.portableTextBlocks[0].label, "Блок сповіщення");
	assert.equal(localized.plugins.seo.portableTextBlocks[0].description, "Попереджувальна плашка");
	assert.equal(localized.plugins.seo.editorPanels[0].label, "Панель SEO");
	assert.equal(localized.plugins.seo.editorPanels[0].title, "Чекліст SEO");
	assert.equal(localized.plugins.seo.editorActions[0].label, "Запустити SEO-аудит");

	// When localizeManifestTaxonomies: false or localizeTaxonomies: false, manifest.taxonomies is untouched
	const withoutManifestTax = localizeManifest(manifest, "uk", {
		dictionary: dict,
		localizeManifestTaxonomies: false,
	});
	assert.equal(withoutManifestTax.collections.articles.label, "Статті");
	assert.equal(withoutManifestTax.taxonomies[0].label, "Categories");
});

test("resolveAdminLocale respects Accept-Language quality weights and POSIX underscore locales when useAcceptLanguage: true", () => {
	const reqWithWeights = new Request("http://localhost:4321/_emdash/api/manifest", {
		headers: { "accept-language": "*;q=0.1, en_US;q=0.7, uk_UA;q=0.9" },
	});
	assert.equal(
		resolveAdminLocale(reqWithWeights, "en", { useAcceptLanguage: true }),
		"uk",
	);
});

test("normalizeLocale respects defaultLocale when given empty or whitespace code", () => {
	assert.equal(normalizeLocale(""), "en");
	assert.equal(normalizeLocale("", "uk"), "uk");
	assert.equal(normalizeLocale("   ", "pl-PL"), "pl");
	assert.equal(normalizeLocale("de_DE", "uk"), "de");
});

test("resolveAdminLocale respects useAcceptLanguage, allowQueryParam, useCookie, and preferCookieOverQuery", () => {
	const reqHeaderOnly = new Request("http://localhost:4321/_emdash/api/manifest", {
		headers: { "accept-language": "uk-UA,uk;q=0.9" },
	});
	assert.equal(
		resolveAdminLocale(reqHeaderOnly, "en", { useAcceptLanguage: false }),
		"en",
	);

	const reqWithQueryAndCookie = new Request(
		"http://localhost:4321/_emdash/api/manifest?locale=pl",
		{
			headers: {
				cookie: "emdash-locale=uk",
				"accept-language": "de-DE,de;q=0.9",
			},
		},
	);
	assert.equal(
		resolveAdminLocale(reqWithQueryAndCookie, "en", { allowQueryParam: false }),
		"uk",
	);
	assert.equal(
		resolveAdminLocale(reqWithQueryAndCookie, "en", {
			allowQueryParam: true,
			preferCookieOverQuery: false,
		}),
		"pl",
	);
	assert.equal(
		resolveAdminLocale(reqWithQueryAndCookie, "en", {
			allowQueryParam: true,
			preferCookieOverQuery: true,
		}),
		"uk",
	);
	assert.equal(
		resolveAdminLocale(reqWithQueryAndCookie, "en", {
			allowQueryParam: false,
			useCookie: false,
			useAcceptLanguage: true,
		}),
		"de",
	);
});

test("localizeManifest supports custom separator and splitBilingual: false", () => {
	const manifest = {
		collections: {
			posts: {
				label: "Записи | Posts",
				fields: {
					title: {
						label: "Заголовок / Title",
					},
				},
			},
		},
	};

	// 1. Custom separator " | "
	const customSepUk = localizeManifest(manifest, "uk", { separator: " | " });
	assert.equal(customSepUk.collections.posts.label, "Записи");
	assert.equal(customSepUk.collections.posts.fields.title.label, "Заголовок / Title");

	const customSepEn = localizeManifest(manifest, "en", { separator: " | " });
	assert.equal(customSepEn.collections.posts.label, "Posts");

	// 2. splitBilingual: false preserves slashes in manifest
	const noSplitUk = localizeManifest(
		{
			collections: {
				posts: { label: "Записи / Posts" },
			},
		},
		"uk",
		{ splitBilingual: false },
	);
	assert.equal(noSplitUk.collections.posts.label, "Записи / Posts");
});

test("extractSeedStrings and assertDictionaryCovers verify dictionary completeness across multiple locales", () => {
	const seed = {
		collections: [
			{
				slug: "projects",
				label: "Projects",
				labelSingular: "Project",
				fields: [
					{ slug: "title", label: "Title" },
				],
			},
		],
		taxonomies: [
			{
				name: "project_categories",
				label: "Project categories",
				labelSingular: "Project category",
			},
		],
		menus: [{ slug: "main", name: "Main navigation" }],
	};

	const extracted = extractSeedStrings(seed);
	assert.deepEqual(extracted.keys.sort(), [
		"Main navigation",
		"Project",
		"Project categories",
		"Project category",
		"Projects",
		"Title",
	]);

	const completeDict = {
		uk: {
			Projects: "Проєкти",
			Project: "Проєкт",
			Title: "Заголовок",
			"Project categories": "Категорії проєктів",
			"Project category": "Категорія проєкту",
			"Main navigation": "Головна навігація",
		},
		de: {
			Projects: "Projekte",
			Project: "Projekt",
			Title: "Titel",
			"Project categories": "Projektkategorien",
			"Project category": "Projektkategorie",
			"Main navigation": "Hauptnavigation",
		},
	};

	const res = assertDictionaryCovers(seed, completeDict, ["uk", "de"]);
	assert.equal(res.covered, true);
	assert.deepEqual(res.locales, ["uk", "de"]);

	// Incomplete dictionary throws with `.missing` breakdown
	const incompleteDict = {
		uk: {
			...completeDict.uk,
			"Project categories": "",
		},
		de: {
			Projects: "Projekte",
		},
	};

	assert.throws(
		() => assertDictionaryCovers(seed, incompleteDict, ["uk", "de"]),
		(err) => {
			assert.ok(err.message.includes("[uk] (1 missing)"));
			assert.ok(err.message.includes("[de] (5 missing)"));
			assert.deepEqual(err.missing.uk, ["Project categories"]);
			assert.equal(err.missing.de.length, 5);
			return true;
		},
	);
});
