import test from "node:test";
import assert from "node:assert/strict";
import { createContext } from "astro/middleware";
import { Kysely } from "kysely";
import { runMigrations } from "emdash/db";
import { createDialect } from "emdash/db/sqlite";
import * as taxonomiesIndexRoute from "emdash/internal/routes/api/taxonomies/index";
import * as taxonomiesNameRoute from "emdash/internal/routes/api/taxonomies/_name_";
import {
	createLocalizationMiddleware,
	withSchemaLocalization,
} from "../src/middleware.mjs";
import { localizeString, TaxonomyTranslationCache } from "../src/localizer.mjs";

test("POST to /schema/collections/x/fields is never intercepted or transformed", async () => {
	const middleware = createLocalizationMiddleware({
		dictionary: {
			uk: { Title: "Заголовок" },
		},
	});

	const originalBody = { label: "Title" };
	const request = new Request("http://localhost:4321/_emdash/api/schema/collections/articles/fields", {
		method: "POST",
		headers: {
			"Cookie": "emdash-locale=uk",
			"Content-Type": "application/json",
		},
		body: JSON.stringify(originalBody),
	});

	const context = {
		request,
		url: new URL(request.url),
	};

	let nextCalled = false;
	const response = await middleware(context, async () => {
		nextCalled = true;
		return new Response(JSON.stringify(originalBody), {
			status: 201,
			headers: {
				"Content-Type": "application/json",
				"ETag": '"original-etag"',
			},
		});
	});

	assert.equal(nextCalled, true);
	assert.equal(response.status, 201);
	const data = await response.json();
	// Should not be translated since method is POST
	assert.equal(data.label, "Title");
	assert.equal(response.headers.get("ETag"), '"original-etag"');
});

test("GET /_emdash/api/schema/block-types/<slug> is localized for single block type", async () => {
	const middleware = createLocalizationMiddleware({
		dictionary: {
			uk: {
				"Hero Banner": "Головний банер",
				"Headline text": "Текст заголовка",
			},
		},
	});

	const request = new Request("http://localhost:4321/_emdash/api/schema/block-types/hero_banner", {
		method: "GET",
		headers: { "Cookie": "emdash-locale=uk" },
	});

	const context = {
		request,
		url: new URL(request.url),
	};

	const singleBlockTypeResponse = {
		item: {
			slug: "hero_banner",
			label: "Hero Banner",
			fields: [
				{
					slug: "headline",
					label: "Headline text",
				},
			],
		},
	};

	const response = await middleware(context, async () => {
		return new Response(JSON.stringify(singleBlockTypeResponse), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});

	const data = await response.json();
	assert.equal(data.item.label, "Головний банер");
	assert.equal(data.item.fields[0].label, "Текст заголовка");
});

test("English labels with ' / ' are not broken or mangled", () => {
	// Even when dictionary only has `uk` (standard CLI output), an English source phrase
	// containing ' / ' (like "Before / after") must NOT be split into "after" for 'en' locale!
	const ukOnlyDict = {
		uk: { "Before / after": "До / після" },
	};

	assert.equal(
		localizeString("Before / after", "uk", { dictionary: ukOnlyDict }),
		"До / після",
	);
	assert.equal(
		localizeString("Before / after", "en", { dictionary: ukOnlyDict }),
		"Before / after",
	);

	// When string has 3 parts (not exactly 2), it should NOT split
	assert.equal(
		localizeString("Small / Medium / Large", "uk", {}),
		"Small / Medium / Large",
	);

	// When splitBilingual: false, it never splits
	assert.equal(
		localizeString("Option A / Option B", "uk", { splitBilingual: false }),
		"Option A / Option B",
	);

	// When active locale is not in separatorLocales (e.g. 'de'), it preserves original
	assert.equal(
		localizeString("Кейси / Case studies", "de", { separatorLocales: ["uk", "en"] }),
		"Кейси / Case studies",
	);
});

test("Vary header is merged and ETag/Content-Length are stripped on modified JSON", async () => {
	const middleware = createLocalizationMiddleware({
		dictionary: {
			uk: { "Test Item": "Тестовий елемент" },
		},
	});

	const request = new Request("http://localhost:4321/_emdash/api/manifest", {
		method: "GET",
		headers: { "Cookie": "emdash-locale=uk" },
	});

	const context = {
		request,
		url: new URL(request.url),
	};

	const manifest = {
		collections: {
			posts: {
				label: "Test Item",
			},
		},
	};

	const response = await middleware(context, async () => {
		return new Response(JSON.stringify(manifest), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Vary": "Origin, X-Custom",
				"ETag": '"old-etag-12345"',
				"Content-Length": "100",
			},
		});
	});

	const vary = response.headers.get("Vary");
	assert.match(vary, /Origin/i);
	assert.match(vary, /X-Custom/i);
	assert.match(vary, /Cookie/i);
	assert.match(vary, /Accept-Language/i);

	// ETag and Content-Length must be removed
	assert.equal(response.headers.get("ETag"), null);
	assert.equal(response.headers.get("Content-Length"), null);

	const localized = await response.json();
	assert.equal(localized.collections.posts.label, "Тестовий елемент");
});

test("excludeSchemaEditor protects /schema/collections from being modified", async () => {
	const middleware = createLocalizationMiddleware({
		excludeSchemaEditor: true,
		dictionary: {
			uk: { "Articles": "Статті" },
		},
	});

	const request = new Request("http://localhost:4321/_emdash/api/schema/collections/articles", {
		method: "GET",
		headers: { "Cookie": "emdash-locale=uk" },
	});

	const context = {
		request,
		url: new URL(request.url),
	};

	const collection = {
		slug: "articles",
		label: "Articles",
	};

	const response = await middleware(context, async () => {
		return new Response(JSON.stringify(collection), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});

	const data = await response.json();
	// Should remain unmodified to prevent Schema Editor from overwriting DB
	assert.equal(data.label, "Articles");
});

test("withSchemaLocalization correctly composes existing onRequest middleware", async () => {
	let outerRan = false;

	const existingOnRequest = async (context, next) => {
		outerRan = true;
		context.customFlag = true;
		const res = await next();
		res.headers.set("X-Outer-Ran", "true");
		return res;
	};

	const combinedMiddleware = withSchemaLocalization(existingOnRequest, {
		dictionary: {
			uk: { "Blog Posts": "Записи блогу" },
		},
	});

	const request = new Request("http://localhost:4321/_emdash/api/manifest", {
		method: "GET",
		headers: { "Cookie": "emdash-locale=uk" },
	});

	const context = {
		request,
		url: new URL(request.url),
	};

	const response = await combinedMiddleware(context, async () => {
		assert.equal(context.customFlag, true);
		return new Response(
			JSON.stringify({
				collections: {
					blog: { label: "Blog Posts" },
				},
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			},
		);
	});

	assert.equal(outerRan, true);
	assert.equal(response.headers.get("X-Outer-Ran"), "true");
	const data = await response.json();
	assert.equal(data.collections.blog.label, "Записи блогу");
});

test("middleware resolves pathname from context.request.url when context.url is omitted", async () => {
	const middleware = createLocalizationMiddleware({
		dictionary: {
			uk: { "Blog Posts": "Записи блогу" },
		},
	});

	const request = new Request("http://localhost:4321/_emdash/api/manifest", {
		method: "GET",
		headers: { "Cookie": "emdash-locale=uk" },
	});

	const response = await middleware({ request }, async () => {
		return new Response(
			JSON.stringify({
				collections: {
					blog: { label: "Blog Posts" },
				},
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			},
		);
	});

	const data = await response.json();
	assert.equal(data.collections.blog.label, "Записи блогу");
});

test("schemaLocalization and createPlugin return valid EmDash descriptor and resolved plugin matching package.json version", async () => {
	const fs = await import("node:fs");
	const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
	const { schemaLocalization, createPlugin } = await import("../src/index.mjs");
	const descriptor = schemaLocalization();
	assert.equal(descriptor.id, "schema-i18n");
	assert.equal(descriptor.version, pkg.version);
	assert.equal(descriptor.format, "native");
	assert.equal(descriptor.entrypoint, "emdash-schema-i18n");
	assert.equal(descriptor.adminEntry, "emdash-schema-i18n/admin");
	assert.equal("options" in descriptor, false);

	const resolved = createPlugin();
	assert.equal(resolved.id, "schema-i18n");
	assert.equal(resolved.version, pkg.version);
	assert.equal(resolved.admin.adminEntry, "emdash-schema-i18n/admin");
});

test("middleware skips JSON parsing if schema endpoint returns non-JSON content-type", async () => {
	const middleware = createLocalizationMiddleware({
		dictionary: { uk: { Test: "Тест" } },
	});

	const request = new Request("http://localhost:4321/_emdash/api/manifest", {
		method: "GET",
		headers: { "Cookie": "emdash-locale=uk" },
	});

	const response = await middleware({ request }, async () => {
		return new Response("<html><body>Login Required</body></html>", {
			status: 200,
			headers: { "Content-Type": "text/html; charset=utf-8" },
		});
	});

	assert.equal(response.status, 200);
	assert.equal(await response.text(), "<html><body>Login Required</body></html>");
});

test("HEAD requests to schema endpoints strip ETag/Content-Length and merge Vary header like GET", async () => {
	const middleware = createLocalizationMiddleware({
		dictionary: { uk: { Articles: "Статті" } },
	});

	const request = new Request("http://localhost:4321/_emdash/api/manifest", {
		method: "HEAD",
		headers: { Cookie: "emdash-locale=uk" },
	});

	const response = await middleware({ request, url: new URL(request.url) }, async () => {
		return new Response(null, {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				ETag: '"etag-head-123"',
				"Content-Length": "456",
				Vary: "Origin",
			},
		});
	});

	assert.equal(response.status, 200);
	assert.equal(response.headers.get("ETag"), null);
	assert.equal(response.headers.get("Content-Length"), null);
	const vary = response.headers.get("Vary") || "";
	assert.match(vary, /Origin/i);
	assert.match(vary, /Cookie/i);
	assert.match(vary, /Accept-Language/i);
	assert.equal(await response.text(), "");
});

test("non-2xx responses (404, 500, 304) pass through middleware untouched", async () => {
	const middleware = createLocalizationMiddleware({
		dictionary: { uk: { "Not Found": "Не знайдено" } },
	});

	for (const status of [304, 404, 500]) {
		const request = new Request("http://localhost:4321/_emdash/api/manifest", {
			method: "GET",
			headers: { Cookie: "emdash-locale=uk" },
		});

		const body = status === 304 ? null : JSON.stringify({ message: "Not Found" });
		const response = await middleware({ request, url: new URL(request.url) }, async () => {
			return new Response(body, {
				status,
				headers: {
					"Content-Type": "application/json",
					ETag: '"keep-etag"',
				},
			});
		});

		assert.equal(response.status, status);
		assert.equal(response.headers.get("ETag"), '"keep-etag"');
		if (status !== 304) {
			const parsed = await response.json();
			assert.equal(parsed.message, "Not Found");
		}
	}
});

test("middleware respects custom separator and splitBilingual: false", async () => {
	const customSepMiddleware = createLocalizationMiddleware({
		separator: " :: ",
	});

	const req1 = new Request("http://localhost:4321/_emdash/api/manifest", {
		method: "GET",
		headers: { Cookie: "emdash-locale=uk" },
	});

	const res1 = await customSepMiddleware({ request: req1 }, async () => {
		return new Response(
			JSON.stringify({
				collections: {
					news: { label: "Новини :: News" },
				},
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);
	});
	const data1 = await res1.json();
	assert.equal(data1.collections.news.label, "Новини");

	const noSplitMiddleware = createLocalizationMiddleware({
		splitBilingual: false,
	});

	const res2 = await noSplitMiddleware({ request: req1 }, async () => {
		return new Response(
			JSON.stringify({
				collections: {
					news: { label: "Новини / News" },
				},
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);
	});
	const data2 = await res2.json();
	assert.equal(data2.collections.news.label, "Новини / News");
});

test("middleware returns original uncancelled response when localization throws an error", async () => {
	const throwingDict = {
		get uk() {
			throw new Error("Simulated dictionary failure");
		},
	};

	const middleware = createLocalizationMiddleware({
		dictionary: throwingDict,
	});

	const request = new Request("http://localhost:4321/_emdash/api/manifest", {
		method: "GET",
		headers: { Cookie: "emdash-locale=uk" },
	});

	const originalPayload = {
		collections: {
			articles: { label: "Original Articles" },
		},
	};

	const prevConsoleError = console.error;
	console.error = () => {};
	try {
		const response = await middleware({ request, url: new URL(request.url) }, async () => {
			return new Response(JSON.stringify(originalPayload), {
				status: 200,
				headers: {
					"Content-Type": "application/json",
					ETag: '"original-etag"',
				},
			});
		});

		assert.equal(response.status, 200);
		assert.equal(response.headers.get("ETag"), '"original-etag"');
		// Body must still be readable and intact!
		const data = await response.json();
		assert.deepEqual(data, originalPayload);
	} finally {
		console.error = prevConsoleError;
	}
});

test("Vary header only includes Cookie and Accept-Language when they participate in locale resolution", async () => {
	// 1. useAcceptLanguage: false -> Vary has Cookie only (not Accept-Language)
	const mwCookieOnly = createLocalizationMiddleware({
		useAcceptLanguage: false,
		dictionary: { uk: { Posts: "Записи" } },
	});
	const reqNoQuery = new Request("http://localhost:4321/_emdash/api/manifest", {
		headers: { Cookie: "emdash-locale=uk" },
	});
	const resCookieOnly = await mwCookieOnly({ request: reqNoQuery }, async () => {
		return new Response(JSON.stringify({ collections: { p: { label: "Posts" } } }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});
	assert.equal(resCookieOnly.headers.get("Vary"), "Cookie");

	// 2. useCookie: false -> Vary has Accept-Language only (not Cookie)
	const mwAcceptOnly = createLocalizationMiddleware({
		useCookie: false,
		dictionary: { uk: { Posts: "Записи" } },
	});
	const resAcceptOnly = await mwAcceptOnly({ request: reqNoQuery }, async () => {
		return new Response(JSON.stringify({ collections: { p: { label: "Posts" } } }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});
	assert.equal(resAcceptOnly.headers.get("Vary"), "Accept-Language");

	// 3. URL with ?locale=uk (default priority) -> neither Cookie nor Accept-Language added to Vary
	const mwDefault = createLocalizationMiddleware({
		dictionary: { uk: { Posts: "Записи" } },
	});
	const reqWithQuery = new Request("http://localhost:4321/_emdash/api/manifest?locale=uk");
	const resWithQuery = await mwDefault({ request: reqWithQuery, url: new URL(reqWithQuery.url) }, async () => {
		return new Response(JSON.stringify({ collections: { p: { label: "Posts" } } }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});
	assert.equal(resWithQuery.headers.get("Vary"), null);
});

test("GET /_emdash/api/taxonomies and /_emdash/api/taxonomies/[name] are localized for uk, original for en, and terms/translations are untouched", async () => {
	const middleware = createLocalizationMiddleware({
		dictionary: {
			uk: {
				"Project categories": "Категорії проєктів",
				"Project category": "Категорія проєкту",
				"taxonomies.industries.label": "Галузі (точкове перевизначення)",
			},
		},
	});

	const listPayload = {
		success: true,
		data: {
			taxonomies: [
				{
					id: "tax_1",
					name: "project_categories",
					label: "Project categories",
					labelSingular: "Project category",
					hierarchical: false,
					collections: ["projects"],
				},
				{
					id: "tax_2",
					name: "industries",
					label: "Industries",
					labelSingular: "Industry",
				},
			],
		},
	};

	// 1. GET /_emdash/api/taxonomies in uk -> localized
	const reqListUk = new Request("http://localhost:4321/_emdash/api/taxonomies", {
		headers: { Cookie: "emdash-locale=uk" },
	});
	const resListUk = await middleware(createContext({ request: reqListUk }), async () => {
		return new Response(JSON.stringify(listPayload), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});
	const dataListUk = await resListUk.json();
	assert.equal(dataListUk.data.taxonomies[0].label, "Категорії проєктів");
	assert.equal(dataListUk.data.taxonomies[0].labelSingular, "Категорія проєкту");
	assert.equal(dataListUk.data.taxonomies[1].label, "Галузі (точкове перевизначення)");

	// 2. GET /_emdash/api/taxonomies in en -> shows original
	const reqListEn = new Request("http://localhost:4321/_emdash/api/taxonomies", {
		headers: { Cookie: "emdash-locale=en" },
	});
	const resListEn = await middleware(createContext({ request: reqListEn }), async () => {
		return new Response(JSON.stringify(listPayload), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});
	const dataListEn = await resListEn.json();
	assert.equal(dataListEn.data.taxonomies[0].label, "Project categories");
	assert.equal(dataListEn.data.taxonomies[0].labelSingular, "Project category");
	assert.equal(dataListEn.data.taxonomies[1].label, "Industries");

	// 3. GET /_emdash/api/taxonomies/project_categories (single definition) in uk -> localized
	const singlePayload = {
		success: true,
		data: {
			taxonomy: {
				id: "tax_1",
				name: "project_categories",
				label: "Project categories",
				labelSingular: "Project category",
			},
		},
	};
	const reqSingleUk = new Request("http://localhost:4321/_emdash/api/taxonomies/project_categories", {
		headers: { Cookie: "emdash-locale=uk" },
	});
	const resSingleUk = await middleware(
		createContext({ request: reqSingleUk, params: { name: "project_categories" } }),
		async () => {
			return new Response(JSON.stringify(singlePayload), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		},
	);
	const dataSingleUk = await resSingleUk.json();
	assert.equal(dataSingleUk.data.taxonomy.label, "Категорії проєктів");
	assert.equal(dataSingleUk.data.taxonomy.labelSingular, "Категорія проєкту");

	// 4. GET /_emdash/api/taxonomies/project_categories/terms and .../translations -> untouched!
	const termsPayload = {
		success: true,
		data: {
			items: [
				{
					id: "term_1",
					slug: "project-categories",
					label: "Project categories",
				},
			],
		},
	};
	for (const path of [
		"/_emdash/api/taxonomies/project_categories/terms",
		"/_emdash/api/taxonomies/project_categories/terms/web/translations",
		"/_emdash/api/taxonomies/project_categories/translations",
	]) {
		const reqTerms = new Request(`http://localhost:4321${path}`, {
			headers: { Cookie: "emdash-locale=uk" },
		});
		const resTerms = await middleware(createContext({ request: reqTerms }), async () => {
			return new Response(JSON.stringify(termsPayload), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		});
		const dataTerms = await resTerms.json();
		assert.equal(dataTerms.data.items[0].label, "Project categories");
	}

	// 5. Explicit localizeTaxonomies: false skips taxonomy definition localization
	const mwDisabled = createLocalizationMiddleware({
		localizeTaxonomies: false,
		dictionary: {
			uk: {
				"Project categories": "Категорії проєктів",
			},
		},
	});
	const resDisabled = await mwDisabled(createContext({ request: reqSingleUk }), async () => {
		return new Response(JSON.stringify(singlePayload), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});
	const dataDisabled = await resDisabled.json();
	assert.equal(dataDisabled.data.taxonomy.label, "Project categories");
});

test("Real Astro context + EmDash SQLite DB: taxonomy GET/POST/PUT/DELETE with restoreTaxonomyLabelsOnWrite", async () => {
	const I18N_KEY = Symbol.for("emdash:i18n-config");
	const prevI18nConfig = globalThis[I18N_KEY];
	globalThis[I18N_KEY] = {
		defaultLocale: "en",
		locales: ["en", "uk"],
	};

	const db = new Kysely({ dialect: createDialect({ url: ":memory:" }) });
	await runMigrations(db);

	const locals = {
		emdash: { db },
		user: { id: "admin-1", role: 100 },
	};

	const dictionary = {
		uk: {
			Categories: "Категорії",
			Category: "Категорія",
			"Project categories": "Категорії проєктів",
			"Project category": "Категорія проєкту",
		},
	};

	try {
		const middleware = createLocalizationMiddleware({
			dictionary,
			restoreTaxonomyLabelsOnWrite: true,
		});

		// 1. POST is never touched (even if body has a label matching dictionary translation)
		const postEnReq = new Request("http://localhost:4321/_emdash/api/taxonomies", {
			method: "POST",
			headers: {
				Cookie: "emdash-locale=uk",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name: "project_categories",
				label: "Project categories",
				labelSingular: "Project category",
				hierarchical: false,
				locale: "en",
			}),
		});
		const postEnCtx = createContext({ request: postEnReq, locals });
		const postEnRes = await middleware(postEnCtx, () =>
			taxonomiesIndexRoute.POST(postEnCtx),
		);
		assert.equal(postEnRes.status, 201);

		// Create the `uk` definition row via POST with a Ukrainian label -> POST body is untouched
		const postUkReq = new Request("http://localhost:4321/_emdash/api/taxonomies", {
			method: "POST",
			headers: {
				Cookie: "emdash-locale=uk",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name: "project_categories",
				label: "Початкові категорії",
				labelSingular: "Початкова категорія",
				hierarchical: false,
				locale: "uk",
			}),
		});
		const postUkCtx = createContext({ request: postUkReq, locals });
		const postUkRes = await middleware(postUkCtx, () =>
			taxonomiesIndexRoute.POST(postUkCtx),
		);
		assert.equal(postUkRes.status, 201);
		const postUkData = await postUkRes.json();
		assert.equal(postUkData.data.taxonomy.label, "Початкові категорії");

		// Verify default middleware (restoreTaxonomyLabelsOnWrite: false) localizes GET but does NOT touch PUT body
		const defaultMiddleware = createLocalizationMiddleware({ dictionary });
		const getDefReq = new Request(
			"http://localhost:4321/_emdash/api/taxonomies/project_categories",
			{
				method: "GET",
				headers: { Cookie: "emdash-locale=uk" },
			},
		);
		const getDefCtx = createContext({
			request: getDefReq,
			params: { name: "project_categories" },
			locals,
		});
		const getDefRes = await defaultMiddleware(getDefCtx, () =>
			taxonomiesNameRoute.GET(getDefCtx),
		);
		const getDefData = await getDefRes.json();
		assert.equal(getDefData.data.taxonomy.label, "Категорії проєктів");

		const putNoRestoreReq = new Request(
			"http://localhost:4321/_emdash/api/taxonomies/project_categories",
			{
				method: "PUT",
				headers: {
					Cookie: "emdash-locale=uk",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ label: "Категорії проєктів" }),
			},
		);
		const putNoRestoreCtx = createContext({
			request: putNoRestoreReq,
			params: { name: "project_categories" },
			locals,
		});
		let bodySeenByDefaultMw = null;
		await defaultMiddleware(putNoRestoreCtx, async () => {
			bodySeenByDefaultMw = await putNoRestoreCtx.request.clone().json();
			return new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		});
		assert.equal(bodySeenByDefaultMw.label, "Категорії проєктів");

		// 2. GET /_emdash/api/taxonomies/project_categories without ?locale= (reads `en` row, translates to `uk` via Cookie)
		const getReq = new Request(
			"http://localhost:4321/_emdash/api/taxonomies/project_categories",
			{
				method: "GET",
				headers: { Cookie: "emdash-locale=uk" },
			},
		);
		const getCtx = createContext({
			request: getReq,
			params: { name: "project_categories" },
			locals,
		});
		const getRes = await middleware(getCtx, () => taxonomiesNameRoute.GET(getCtx));
		const getData = await getRes.json();
		assert.equal(getData.data.taxonomy.locale, "en");
		assert.equal(getData.data.taxonomy.label, "Категорії проєктів");
		assert.equal(getData.data.taxonomy.labelSingular, "Категорія проєкту");

		// 3. PUT ?locale=uk with deliberate Ukrainian label ("Категорії проєктів") is NOT changed,
		// and affects ONLY the `uk` row!
		const putUkReq = new Request(
			"http://localhost:4321/_emdash/api/taxonomies/project_categories?locale=uk",
			{
				method: "PUT",
				headers: {
					Cookie: "emdash-locale=uk",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					label: "Категорії проєктів",
					labelSingular: "Категорія проєкту",
				}),
			},
		);
		const putUkCtx = createContext({
			request: putUkReq,
			params: { name: "project_categories" },
			locals,
		});
		const putUkRes = await middleware(putUkCtx, () => taxonomiesNameRoute.PUT(putUkCtx));
		assert.equal(putUkRes.status, 200);

		const rowsAfterPutUk = (
			await db
				.selectFrom("_emdash_taxonomy_defs")
				.select(["locale", "label", "label_singular"])
				.where("name", "=", "project_categories")
				.orderBy("locale", "asc")
				.execute()
		).map((r) => ({ ...r }));
		assert.deepEqual(rowsAfterPutUk, [
			{
				locale: "en",
				label: "Project categories",
				label_singular: "Project category",
			},
			{
				locale: "uk",
				label: "Категорії проєктів",
				label_singular: "Категорія проєкту",
			},
		]);

		// 4. PUT without ?locale= echoing back the translated label from previous GET
		// restores original English label on the `en` row, and leaves `uk` row untouched!
		const putDefaultEchoReq = new Request(
			"http://localhost:4321/_emdash/api/taxonomies/project_categories",
			{
				method: "PUT",
				headers: {
					Cookie: "emdash-locale=uk",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					label: "Категорії проєктів",
					labelSingular: "Категорія проєкту",
					hierarchical: true,
				}),
			},
		);
		const putDefaultEchoCtx = createContext({
			request: putDefaultEchoReq,
			params: { name: "project_categories" },
			locals,
		});
		const putDefaultEchoRes = await middleware(putDefaultEchoCtx, () =>
			taxonomiesNameRoute.PUT(putDefaultEchoCtx),
		);
		assert.equal(putDefaultEchoRes.status, 200);

		const rowsAfterEchoPut = (
			await db
				.selectFrom("_emdash_taxonomy_defs")
				.select(["locale", "label", "label_singular", "hierarchical"])
				.where("name", "=", "project_categories")
				.orderBy("locale", "asc")
				.execute()
		).map((r) => ({ ...r }));
		assert.deepEqual(rowsAfterEchoPut, [
			{
				locale: "en",
				label: "Project categories",
				label_singular: "Project category",
				hierarchical: 1,
			},
			{
				locale: "uk",
				label: "Категорії проєктів",
				label_singular: "Категорія проєкту",
				hierarchical: 1,
			},
		]);

		// 5. PUT with a label that middleware NEVER served is NOT changed,
		// and affects ONLY the target locale's row (`en` when ?locale= is omitted)!
		const putCustomReq = new Request(
			"http://localhost:4321/_emdash/api/taxonomies/project_categories",
			{
				method: "PUT",
				headers: {
					Cookie: "emdash-locale=uk",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					label: "Portfolio Categories",
					labelSingular: "Portfolio Category",
				}),
			},
		);
		const putCustomCtx = createContext({
			request: putCustomReq,
			params: { name: "project_categories" },
			locals,
		});
		const putCustomRes = await middleware(putCustomCtx, () =>
			taxonomiesNameRoute.PUT(putCustomCtx),
		);
		assert.equal(putCustomRes.status, 200);

		const rowsAfterCustomPut = (
			await db
				.selectFrom("_emdash_taxonomy_defs")
				.select(["locale", "label", "label_singular"])
				.where("name", "=", "project_categories")
				.orderBy("locale", "asc")
				.execute()
		).map((r) => ({ ...r }));
		assert.deepEqual(rowsAfterCustomPut, [
			{
				locale: "en",
				label: "Portfolio Categories",
				label_singular: "Portfolio Category",
			},
			{
				locale: "uk",
				label: "Категорії проєктів",
				label_singular: "Категорія проєкту",
			},
		]);

		// 6. DELETE request and its body are never touched
		const deleteReq = new Request(
			"http://localhost:4321/_emdash/api/taxonomies/project_categories",
			{
				method: "DELETE",
				headers: {
					Cookie: "emdash-locale=uk",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ label: "Категорії проєктів" }),
			},
		);
		const deleteCtx = createContext({
			request: deleteReq,
			params: { name: "project_categories" },
			locals,
		});
		let deleteBodyAtHandler = null;
		const deleteRes = await middleware(deleteCtx, async () => {
			deleteBodyAtHandler = await deleteCtx.request.clone().json();
			return taxonomiesNameRoute.DELETE(deleteCtx);
		});
		assert.equal(deleteRes.status, 200);
		assert.equal(deleteBodyAtHandler.label, "Категорії проєктів");

		const remainingRows = await db
			.selectFrom("_emdash_taxonomy_defs")
			.select(["id"])
			.where("name", "=", "project_categories")
			.execute();
		assert.equal(remainingRows.length, 0);
	} finally {
		globalThis[I18N_KEY] = prevI18nConfig;
		await db.destroy();
	}
});

test("TaxonomyTranslationCache enforces bounded size and TTL expiration", () => {
	let currentTime = 1_000;
	const cache = new TaxonomyTranslationCache({
		maxSize: 2,
		ttlMs: 5_000,
		now: () => currentTime,
	});

	cache.set("tax_a", "en", "label", "Таксономія А", "Taxonomy A");
	cache.set("tax_b", "en", "label", "Таксономія Б", "Taxonomy B");
	assert.equal(cache.size, 2);

	// Adding a 3rd entry evicts the oldest ("tax_a")
	cache.set("tax_c", "en", "label", "Таксономія В", "Taxonomy C");
	assert.equal(cache.size, 2);
	assert.equal(cache.getOriginal("tax_a", "en", "label", "Таксономія А"), undefined);
	assert.equal(cache.getOriginal("tax_b", "en", "label", "Таксономія Б"), "Taxonomy B");
	assert.equal(cache.getOriginal("tax_c", "en", "label", "Таксономія В"), "Taxonomy C");

	// Advance clock past TTL -> entries expire
	currentTime += 6_000;
	assert.equal(cache.getOriginal("tax_b", "en", "label", "Таксономія Б"), undefined);
	assert.equal(cache.getOriginal("tax_c", "en", "label", "Таксономія В"), undefined);
	assert.equal(cache.size, 0);
});






