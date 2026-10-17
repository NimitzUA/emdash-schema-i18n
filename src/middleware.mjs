import {
	resolveAdminLocale,
	localizeManifest,
	localizeBlockTypesResponse,
	localizeCollectionsResponse,
	installLocaleReloadWatcher,
} from "./localizer.mjs";

export const RELOAD_WATCHER_SCRIPT = `<script id="emdash-i18n-watcher">\n(${installLocaleReloadWatcher.toString()})();\n</script>`;

function mergeVaryHeader(
	headers,
	{ varyCookie = true, varyAcceptLanguage = true } = {},
) {
	const desired = [];
	if (varyCookie) desired.push("Cookie");
	if (varyAcceptLanguage) desired.push("Accept-Language");
	if (desired.length === 0) return;

	const existingVary = headers.get("Vary");
	if (!existingVary) {
		headers.set("Vary", desired.join(", "));
		return;
	}
	const tokens = new Set(
		existingVary
			.split(",")
			.map((s) => s.trim().toLowerCase())
			.filter(Boolean),
	);
	const toAdd = desired.filter((h) => !tokens.has(h.toLowerCase()));
	if (toAdd.length > 0) {
		headers.set("Vary", `${existingVary}, ${toAdd.join(", ")}`);
	}
}

function hasQueryLocaleParam(context) {
	const search = context?.url?.search;
	if (typeof search === "string") {
		return Boolean(new URLSearchParams(search).get("locale")?.trim());
	}
	if (context?.request?.url) {
		try {
			return Boolean(
				new URL(context.request.url).searchParams.get("locale")?.trim(),
			);
		} catch {
			return false;
		}
	}
	return false;
}

function resolvePathname(context) {
	if (context?.url?.pathname) return context.url.pathname;
	if (context?.request?.url) {
		try {
			return new URL(context.request.url).pathname;
		} catch {
			return "";
		}
	}
	return "";
}

/**
 * Creates an Astro middleware handler that intercepts `/_emdash/api/manifest`
 * and `/_emdash/api/schema/block-types` and dynamically localizes the schema JSON
 * according to the admin session language.
 *
 * @param {object} [options]
 * @param {Record<string, Record<string, string>>} [options.dictionary]
 * @param {string} [options.separator=" / "]
 * @param {boolean} [options.splitBilingual=true]
 * @param {string[]} [options.separatorLocales=["uk", "en"]]
 * @param {string} [options.defaultLocale="en"]
 * @param {boolean} [options.excludeSchemaEditor=true] Protects Schema Editor (Content Types) from receiving translated labels.
 * @param {boolean} [options.localizeSchemaCollections=false] Explicitly allow localizing /schema/collections.
 * @param {boolean} [options.injectHtmlWatcher=false] Inject inline watcher script into admin HTML (unnecessary when adminEntry is loaded).
 * @param {boolean} [options.autoReloadOnLocaleChange] Deprecated alias for injectHtmlWatcher.
 * @param {boolean} [options.useCookie=true] Read `emdash-locale` cookie when resolving locale.
 * @param {boolean} [options.useAcceptLanguage=true] Fall back to `Accept-Language` header when cookie is absent.
 * @param {boolean} [options.allowQueryParam=true] Allow `?locale=` query parameter override.
 * @param {boolean} [options.preferCookieOverQuery=false] Give `emdash-locale` cookie higher priority than `?locale=`.
 * @returns {(context: any, next: () => Promise<Response>) => Promise<Response>}
 */
export function createLocalizationMiddleware(options = {}) {
	const {
		defaultLocale = "en",
		excludeSchemaEditor = true,
		localizeSchemaCollections = false,
		injectHtmlWatcher = options.autoReloadOnLocaleChange ?? false,
		useCookie = true,
		useAcceptLanguage = true,
		allowQueryParam = true,
		preferCookieOverQuery = false,
	} = options;

	return async function localizationMiddleware(context, next) {
		// 1. Fast-path: process only GET and HEAD requests to prevent mutating writes (POST/PUT/PATCH/DELETE)
		const method = context.request?.method || "GET";
		if (method !== "GET" && method !== "HEAD") {
			return next();
		}

		// 2. Fast-path: skip all non-EmDash routes immediately without awaiting response inspection
		const pathname = resolvePathname(context);
		if (!pathname.startsWith("/_emdash/")) {
			return next();
		}

		const response = await next();

		if (response?.status >= 200 && response?.status < 300) {
			const isManifest = pathname === "/_emdash/api/manifest";
			const isBlockTypes =
				pathname === "/_emdash/api/schema/block-types" ||
				pathname.startsWith("/_emdash/api/schema/block-types/");

			// Schema editor protection: avoid localizing /schema/collections unless explicitly opted in
			const shouldLocalizeCollections =
				!excludeSchemaEditor || localizeSchemaCollections;
			const isCollections =
				shouldLocalizeCollections &&
				(pathname === "/_emdash/api/schema/collections" ||
					pathname.startsWith("/_emdash/api/schema/collections/"));

			if (isManifest || isBlockTypes || isCollections) {
				const contentType = response.headers.get("content-type") || "";
				if (contentType && !contentType.includes("json")) {
					return response;
				}

				// If ?locale= is present in the URL and takes priority over cookie,
				// the URL itself determines the locale without consulting Cookie or Accept-Language.
				const resolvedFromQuery =
					allowQueryParam &&
					!preferCookieOverQuery &&
					hasQueryLocaleParam(context);
				const varyOptions = {
					varyCookie: Boolean(useCookie) && !resolvedFromQuery,
					varyAcceptLanguage: Boolean(useAcceptLanguage) && !resolvedFromQuery,
				};

				if (method === "HEAD") {
					const headers = new Headers(response.headers);
					headers.set("Content-Type", "application/json; charset=utf-8");
					headers.delete("etag");
					headers.delete("content-length");
					mergeVaryHeader(headers, varyOptions);

					const headResponse = new Response(null, {
						status: response.status,
						statusText: response.statusText,
						headers,
					});
					await response.body?.cancel().catch(() => {});
					return headResponse;
				}

				try {
					const locale = resolveAdminLocale(context.request, defaultLocale, {
						useCookie,
						useAcceptLanguage,
						allowQueryParam,
						preferCookieOverQuery,
					});
					const data = await response.clone().json();
					let localized = data;

					if (isManifest) {
						localized = localizeManifest(data, locale, options);
					} else if (isBlockTypes) {
						localized = localizeBlockTypesResponse(data, locale, options);
					} else if (isCollections) {
						localized = localizeCollectionsResponse(data, locale, options);
					}

					const bodyText = JSON.stringify(localized);
					const headers = new Headers(response.headers);
					headers.set("Content-Type", "application/json; charset=utf-8");
					headers.delete("etag");
					headers.delete("content-length");
					mergeVaryHeader(headers, varyOptions);

					const localizedResponse = new Response(bodyText, {
						status: response.status,
						statusText: response.statusText,
						headers,
					});
					await response.body?.cancel().catch(() => {});
					return localizedResponse;
				} catch (err) {
					console.error("[emdash-schema-i18n] Failed to localize schema response:", err);
					return response;
				}
			}

			if (
				injectHtmlWatcher &&
				pathname.startsWith("/_emdash/admin") &&
				response.headers.get("content-type")?.includes("text/html")
			) {
				if (method === "HEAD") {
					const headers = new Headers(response.headers);
					headers.delete("content-length");
					headers.delete("etag");
					const headResponse = new Response(null, {
						status: response.status,
						statusText: response.statusText,
						headers,
					});
					await response.body?.cancel().catch(() => {});
					return headResponse;
				}

				try {
					const resClone = response.clone();
					const html = await resClone.text();
					if (!html.includes('id="emdash-i18n-watcher"')) {
						const injectedHtml = /<\/body>/i.test(html)
							? html.replace(/<\/body>/i, (match) => `${RELOAD_WATCHER_SCRIPT}${match}`)
							: `${html}${RELOAD_WATCHER_SCRIPT}`;
						const headers = new Headers(response.headers);
						headers.delete("content-length");
						headers.delete("etag");
						const htmlResponse = new Response(injectedHtml, {
							status: response.status,
							statusText: response.statusText,
							headers,
						});
						await response.body?.cancel().catch(() => {});
						return htmlResponse;
					}
				} catch (err) {
					console.error("[emdash-schema-i18n] Failed to inject auto-reload watcher:", err);
				}
			}
		}

		return response;
	};
}

/**
 * Helper to compose localization middleware with an existing middleware handler.
 *
 * @param {Function} [existingOnRequest] An existing Astro onRequest middleware handler.
 * @param {object} [options] Schema localization options.
 * @returns {Function} Combined Astro middleware handler.
 */
export function withSchemaLocalization(existingOnRequest, options = {}) {
	const localizationMiddleware = createLocalizationMiddleware(options);

	if (typeof existingOnRequest !== "function") {
		return localizationMiddleware;
	}

	return async function chainedMiddleware(context, next) {
		return existingOnRequest(context, () => localizationMiddleware(context, next));
	};
}

export default createLocalizationMiddleware;
