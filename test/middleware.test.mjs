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



