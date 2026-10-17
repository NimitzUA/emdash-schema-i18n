import test from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.EMDASH_TEST_URL || "http://127.0.0.1:4321";

async function isServerUp() {
	try {
		const res = await fetch(`${BASE_URL}/`);
		return res.ok;
	} catch {
		return false;
	}
}

test("Live EmDash E2E: Schema, collections, and block types localization", async (t) => {
	const serverRunning = await isServerUp();
	if (!serverRunning) {
		t.skip(`Skipping live EmDash test: dev server not reachable at ${BASE_URL}. Run 'npm run example:dev' first.`);
		return;
	}

	// 1. Authenticate via dev bypass
	const bypassRes = await fetch(`${BASE_URL}/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`, {
		redirect: "manual",
	});
	const setCookieHeader = bypassRes.headers.get("set-cookie") || "";
	const sessionMatch = setCookieHeader.match(/astro-session=([^;]+)/);
	assert.ok(sessionMatch, "Should receive astro-session cookie from dev-bypass");
	const sessionCookie = `astro-session=${sessionMatch[1]}`;

	// 2. Test English / default manifest
	const enManifestRes = await fetch(`${BASE_URL}/_emdash/api/manifest`, {
		headers: { Cookie: sessionCookie },
	});
	assert.equal(enManifestRes.status, 200);
	const enManifest = await enManifestRes.json();
	assert.equal(enManifest.data.collections.articles.label, "Articles");
	assert.equal(enManifest.data.collections.articles.labelSingular, "Article");
	assert.equal(enManifest.data.collections.articles.fields.title.label, "Article Title");
	assert.equal(enManifest.data.collections.articles.fields.article_type.label, "Article Type");
	assert.equal(enManifest.data.collections.articles.fields.body.label, "Page Content");
	assert.equal(enManifest.data.collections.articles.fields.body.blockTypes[0].label, "Hero Banner");
	assert.equal(enManifest.data.collections.articles.fields.body.blockTypes[0].category, "Marketing");
	assert.equal(
		enManifest.data.collections.articles.fields.body.blockTypes[0].versions[0].fields[0].label,
		"Main Headline"
	);

	// 3. Test Ukrainian manifest via ?locale=uk query parameter
	const ukManifestRes = await fetch(`${BASE_URL}/_emdash/api/manifest?locale=uk`, {
		headers: { Cookie: sessionCookie },
	});
	assert.equal(ukManifestRes.status, 200);
	const ukManifest = await ukManifestRes.json();
	assert.equal(ukManifest.data.collections.articles.label, "Статті");
	assert.equal(ukManifest.data.collections.articles.labelSingular, "Стаття");
	assert.equal(ukManifest.data.collections.articles.fields.title.label, "Заголовок статті");
	assert.equal(ukManifest.data.collections.articles.fields.article_type.label, "Тип статті");
	assert.equal(ukManifest.data.collections.articles.fields.article_type.options[0].label, "Новина");
	assert.equal(ukManifest.data.collections.articles.fields.article_type.options[1].label, "Редакційна стаття");
	assert.equal(ukManifest.data.collections.articles.fields.body.label, "Вміст сторінки");
	assert.equal(ukManifest.data.collections.articles.fields.body.blockTypes[0].label, "Головний банер");
	assert.equal(
		ukManifest.data.collections.articles.fields.body.blockTypes[0].description,
		"Великий візуальний банер із заголовком"
	);
	assert.equal(ukManifest.data.collections.articles.fields.body.blockTypes[0].category, "Маркетинг");
	assert.equal(
		ukManifest.data.collections.articles.fields.body.blockTypes[0].versions[0].fields[0].label,
		"Головний заголовок"
	);
	assert.equal(
		ukManifest.data.collections.articles.fields.body.blockTypes[0].versions[0].fields[1].label,
		"Підзаголовок"
	);
	assert.equal(ukManifest.data.collections.articles.fields.body.blockTypes[1].label, "Відгук клієнта");
	assert.equal(ukManifest.data.collections.articles.fields.body.blockTypes[1].category, "Соціальні докази");
	assert.equal(
		ukManifest.data.collections.articles.fields.body.blockTypes[1].versions[0].fields[0].label,
		"Текст цитати"
	);
	assert.equal(
		ukManifest.data.collections.articles.fields.body.blockTypes[1].versions[0].fields[1].label,
		"Ім'я автора"
	);

	// 4. Test collections schema API with emdash-locale cookie
	const ukCollectionsRes = await fetch(`${BASE_URL}/_emdash/api/schema/collections`, {
		headers: { Cookie: `${sessionCookie}; emdash-locale=uk` },
	});
	assert.equal(ukCollectionsRes.status, 200);
	const ukCollections = await ukCollectionsRes.json();
	assert.equal(ukCollections.data.items[0].label, "Статті");
	assert.equal(ukCollections.data.items[0].labelSingular, "Стаття");
	assert.equal(ukCollections.data.items[0].description, "Новини компанії та блог");

	// 5. Test block-types schema API with Accept-Language header
	const ukBlockTypesRes = await fetch(`${BASE_URL}/_emdash/api/schema/block-types`, {
		headers: {
			Cookie: sessionCookie,
			"Accept-Language": "uk-UA,uk;q=0.9,en;q=0.8",
		},
	});
	assert.equal(ukBlockTypesRes.status, 200);
	const ukBlockTypes = await ukBlockTypesRes.json();
	assert.equal(ukBlockTypes.data.items[0].label, "Головний банер");
	assert.equal(ukBlockTypes.data.items[0].category, "Маркетинг");
	assert.equal(ukBlockTypes.data.items[1].label, "Відгук клієнта");
	assert.equal(ukBlockTypes.data.items[1].category, "Соціальні докази");

	// 6. Test Admin HTML auto-reload watcher injection
	const adminHtmlRes = await fetch(`${BASE_URL}/_emdash/admin`, {
		headers: { Cookie: sessionCookie },
	});
	assert.equal(adminHtmlRes.status, 200);
	const adminHtml = await adminHtmlRes.text();
	assert.ok(adminHtml.includes('id="emdash-i18n-watcher"'), "Should contain emdash-i18n-watcher script in HTML");
	assert.ok(adminHtml.includes("MutationObserver"), "Watcher script should use MutationObserver");
});
