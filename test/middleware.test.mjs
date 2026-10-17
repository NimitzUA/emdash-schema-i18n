import test from "node:test";
import assert from "node:assert/strict";
import {
	createLocalizationMiddleware,
	withSchemaLocalization,
} from "../src/middleware.mjs";
import { localizeString } from "../src/localizer.mjs";

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
				"Category for portfolio projects": "Категорія для портфоліо-проєктів",
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
					description: "Category for portfolio projects",
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
	const resListUk = await middleware({ request: reqListUk, url: new URL(reqListUk.url) }, async () => {
		return new Response(JSON.stringify(listPayload), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});
	const dataListUk = await resListUk.json();
	assert.equal(dataListUk.data.taxonomies[0].label, "Категорії проєктів");
	assert.equal(dataListUk.data.taxonomies[0].labelSingular, "Категорія проєкту");
	assert.equal(dataListUk.data.taxonomies[0].description, "Категорія для портфоліо-проєктів");
	assert.equal(dataListUk.data.taxonomies[1].label, "Галузі (точкове перевизначення)");

	// 2. GET /_emdash/api/taxonomies in en -> shows original
	const reqListEn = new Request("http://localhost:4321/_emdash/api/taxonomies", {
		headers: { Cookie: "emdash-locale=en" },
	});
	const resListEn = await middleware({ request: reqListEn, url: new URL(reqListEn.url) }, async () => {
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
	const resSingleUk = await middleware({ request: reqSingleUk, url: new URL(reqSingleUk.url) }, async () => {
		return new Response(JSON.stringify(singlePayload), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});
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
		const resTerms = await middleware({ request: reqTerms, url: new URL(reqTerms.url) }, async () => {
			return new Response(JSON.stringify(termsPayload), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		});
		const dataTerms = await resTerms.json();
		assert.equal(dataTerms.data.items[0].label, "Project categories");
	}
});

test("GET /_emdash/api/taxonomies with Referer from taxonomy management screen is NOT localized", async () => {
	const middleware = createLocalizationMiddleware({
		dictionary: {
			uk: {
				"Project categories": "Категорії проєктів",
				"Project category": "Категорія проєкту",
			},
		},
	});

	const payload = {
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

	const request = new Request("http://localhost:4321/_emdash/api/taxonomies/project_categories", {
		headers: {
			Cookie: "emdash-locale=uk",
			Referer: "http://localhost:4321/_emdash/admin/taxonomies/project_categories",
		},
	});

	const response = await middleware({ request, url: new URL(request.url) }, async () => {
		return new Response(JSON.stringify(payload), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});

	const data = await response.json();
	assert.equal(data.data.taxonomy.label, "Project categories");
	assert.equal(data.data.taxonomy.labelSingular, "Project category");
});

test("PUT /_emdash/api/taxonomies/[name] with translated label restores original before saving", async () => {
	const middleware = createLocalizationMiddleware({
		dictionary: {
			uk: {
				"Project categories": "Категорії проєктів",
				"Project category": "Категорія проєкту",
				"taxonomies.custom_tax.label": "Спеціальна таксономія",
			},
		},
	});

	// 1. Reverse lookup directly from dictionary (even without a prior GET)
	const putReq1 = new Request("http://localhost:4321/_emdash/api/taxonomies/project_categories", {
		method: "PUT",
		headers: {
			Cookie: "emdash-locale=uk",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			label: "Категорії проєктів",
			labelSingular: "Категорія проєкту",
			hierarchical: true,
			collections: ["projects"],
		}),
	});

	let savedBody1 = null;
	const ctx1 = { request: putReq1, url: new URL(putReq1.url) };
	await middleware(ctx1, async () => {
		savedBody1 = await ctx1.request.json();
		return new Response(JSON.stringify({ success: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});

	assert.equal(savedBody1.label, "Project categories");
	assert.equal(savedBody1.labelSingular, "Project category");
	assert.equal(savedBody1.hierarchical, true);

	// 2. Restore exact original from cached GET when using key-path override ("taxonomies.custom_tax.label")
	const getReq = new Request("http://localhost:4321/_emdash/api/taxonomies/custom_tax", {
		method: "GET",
		headers: { Cookie: "emdash-locale=uk" },
	});
	await middleware({ request: getReq, url: new URL(getReq.url) }, async () => {
		return new Response(
			JSON.stringify({
				data: {
					taxonomy: {
						name: "custom_tax",
						label: "Custom Taxonomy Original",
					},
				},
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);
	});

	const putReq2 = new Request("http://localhost:4321/_emdash/api/taxonomies/custom_tax", {
		method: "PUT",
		headers: {
			Cookie: "emdash-locale=uk",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			label: "Спеціальна таксономія",
		}),
	});

	let savedBody2 = null;
	const ctx2 = { request: putReq2, url: new URL(putReq2.url) };
	await middleware(ctx2, async () => {
		savedBody2 = await ctx2.request.json();
		return new Response(JSON.stringify({ success: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});

	assert.equal(savedBody2.label, "Custom Taxonomy Original");
});





