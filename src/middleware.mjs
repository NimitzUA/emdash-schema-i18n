import {
	resolveAdminLocale,
	localizeManifest,
	localizeBlockTypesResponse,
	localizeCollectionsResponse,
	installLocaleReloadWatcher,
} from "./localizer.mjs";

export const RELOAD_WATCHER_SCRIPT = `<script id="emdash-i18n-watcher">\n(${installLocaleReloadWatcher.toString()})();\n</script>`;

function mergeVaryHeader(headers) {
	const existingVary = headers.get("Vary");
	if (!existingVary) {
		headers.set("Vary", "Cookie, Accept-Language");
		return;
	}
	const tokens = new Set(
		existingVary
			.split(",")
			.map((s) => s.trim().toLowerCase())
			.filter(Boolean),
	);
	const toAdd = [];
	if (!tokens.has("cookie")) toAdd.push("Cookie");
	if (!tokens.has("accept-language")) toAdd.push("Accept-Language");
	if (toAdd.length > 0) {
		headers.set("Vary", `${existingVary}, ${toAdd.join(", ")}`);
	}
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
 * @returns {(context: any, next: () => Promise<Response>) => Promise<Response>}
 */
export function createLocalizationMiddleware(options = {}) {
	const {
		defaultLocale = "en",
		excludeSchemaEditor = true,
		localizeSchemaCollections = false,
		injectHtmlWatcher = options.autoReloadOnLocaleChange ?? false,
		useAcceptLanguage = true,
		allowQueryParam = true,
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

				if (method === "HEAD") {
					await response.body?.cancel().catch(() => {});
					const headers = new Headers(response.headers);
					headers.set("Content-Type", "application/json; charset=utf-8");
					headers.delete("etag");
					headers.delete("content-length");
					mergeVaryHeader(headers);

					return new Response(null, {
						status: response.status,
						statusText: response.statusText,
						headers,
					});
				}

				try {
					const locale = resolveAdminLocale(context.request, defaultLocale, {
						useAcceptLanguage,
						allowQueryParam,
					});
					const data = await response.clone().json();
					await response.body?.cancel().catch(() => {});
					let localized = data;

					if (isManifest) {
						localized = localizeManifest(data, locale, options);
					} else if (isBlockTypes) {
						localized = localizeBlockTypesResponse(data, locale, options);
					} else if (isCollections) {
						localized = localizeCollectionsResponse(data, locale, options);
					}

					const headers = new Headers(response.headers);
					headers.set("Content-Type", "application/json; charset=utf-8");
					headers.delete("etag");
					headers.delete("content-length");
					mergeVaryHeader(headers);

					return new Response(JSON.stringify(localized), {
						status: response.status,
						statusText: response.statusText,
						headers,
					});
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
					await response.body?.cancel().catch(() => {});
					const headers = new Headers(response.headers);
					headers.delete("content-length");
					headers.delete("etag");
					return new Response(null, {
						status: response.status,
						statusText: response.statusText,
						headers,
					});
				}

				try {
					const resClone = response.clone();
					const html = await resClone.text();
					if (!html.includes('id="emdash-i18n-watcher"')) {
						await response.body?.cancel().catch(() => {});
						const injectedHtml = /<\/body>/i.test(html)
							? html.replace(/<\/body>/i, (match) => `${RELOAD_WATCHER_SCRIPT}${match}`)
							: `${html}${RELOAD_WATCHER_SCRIPT}`;
						const headers = new Headers(response.headers);
						headers.delete("content-length");
						headers.delete("etag");
						return new Response(injectedHtml, {
							status: response.status,
							statusText: response.statusText,
							headers,
						});
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
