import {
	resolveAdminLocale,
	localizeManifest,
	localizeBlockTypesResponse,
	localizeCollectionsResponse,
	localizeTaxonomiesResponse,
	extractRawTaxonomies,
	restoreOriginalTaxonomyInput,
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
 * Matches `/_emdash/api/taxonomies` and `/_emdash/api/taxonomies/[name]`,
 * while excluding `/terms...`, `/translations`, `/reorder`, and `/bulk-tag`.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
function isTaxonomyDefinitionPath(pathname) {
	if (pathname === "/_emdash/api/taxonomies") return true;
	if (!pathname.startsWith("/_emdash/api/taxonomies/")) return false;
	const rest = pathname.slice("/_emdash/api/taxonomies/".length);
	return Boolean(rest) && !rest.includes("/") && rest !== "bulk-tag";
}

function getSingleTaxonomyName(pathname) {
	if (!pathname.startsWith("/_emdash/api/taxonomies/")) return null;
	const rest = pathname.slice("/_emdash/api/taxonomies/".length);
	if (!rest || rest.includes("/") || rest === "bulk-tag") return null;
	try {
		return decodeURIComponent(rest);
	} catch {
		return rest;
	}
}

function isTaxonomyEditorReferer(request) {
	const referer =
		request?.headers?.get("referer") || request?.headers?.get("referrer");
	if (!referer) return false;
	try {
		const url = new URL(referer, "http://localhost");
		return (
			url.pathname === "/_emdash/admin/taxonomies" ||
			url.pathname.startsWith("/_emdash/admin/taxonomies/")
		);
	} catch {
		return referer.includes("/_emdash/admin/taxonomies");
	}
}

/**
 * Creates an Astro middleware handler that intercepts `/_emdash/api/manifest`,
 * `/_emdash/api/schema/block-types`, and `/_emdash/api/taxonomies` and dynamically
 * localizes the schema JSON according to the admin session language.
 *
 * @param {object} [options]
 * @param {Record<string, Record<string, string>>} [options.dictionary]
 * @param {string} [options.separator=" / "]
 * @param {boolean} [options.splitBilingual=true]
 * @param {string[]} [options.separatorLocales=["uk", "en"]]
 * @param {string} [options.defaultLocale="en"]
 * @param {boolean} [options.excludeSchemaEditor=true] Protects Schema Editor (Content Types & Taxonomies manager) from receiving translated labels.
 * @param {boolean} [options.localizeSchemaCollections=false] Explicitly allow localizing /schema/collections.
 * @param {boolean} [options.localizeTaxonomies=true] Localize taxonomy definitions on /_emdash/api/taxonomies and /_emdash/api/taxonomies/[name].
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
		localizeTaxonomies = true,
		injectHtmlWatcher = options.autoReloadOnLocaleChange ?? false,
		useCookie = true,
		useAcceptLanguage = true,
		allowQueryParam = true,
		preferCookieOverQuery = false,
	} = options;

	/** @type {Map<string, { label?: string, labelSingular?: string, description?: string }>} */
	const cachedTaxonomyOriginals = new Map();

	return async function localizationMiddleware(context, next) {
		const method = context.request?.method || "GET";
		const pathname = resolvePathname(context);

		// Fast-path: skip all non-EmDash routes immediately
		if (!pathname.startsWith("/_emdash/")) {
			return next();
		}

		// Safeguard (b): On PUT/PATCH to /_emdash/api/taxonomies/[name], restore canonical
		// original label/labelSingular/description if the incoming value matches the active locale's translation.
		if (
			localizeTaxonomies &&
			(method === "PUT" || method === "PATCH")
		) {
			const taxName = getSingleTaxonomyName(pathname);
			const reqContentType = context.request?.headers?.get("content-type") || "";
			if (taxName && reqContentType.includes("json")) {
				try {
					const rawBody = await context.request.clone().json();
					const locale = resolveAdminLocale(context.request, defaultLocale, {
						useCookie,
						useAcceptLanguage,
						allowQueryParam,
						preferCookieOverQuery,
					});
					const { body: restoredBody, changed } = restoreOriginalTaxonomyInput(
						rawBody,
						taxName,
						locale,
						options,
						cachedTaxonomyOriginals,
					);
					if (changed) {
						const newHeaders = new Headers(context.request.headers);
						newHeaders.delete("content-length");
						const updatedRequest = new Request(context.request.url, {
							method: context.request.method,
							headers: newHeaders,
							body: JSON.stringify(restoredBody),
						});
						await context.request.body?.cancel().catch(() => {});
						context.request = updatedRequest;
					}
				} catch {
					// If body parsing fails, proceed with untouched request
				}
			}
			return next();
		}

		// Process only GET and HEAD requests for response localization
		if (method !== "GET" && method !== "HEAD") {
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

			const isTaxonomyDefRoute =
				localizeTaxonomies && isTaxonomyDefinitionPath(pathname);

			if (isManifest || isBlockTypes || isCollections || isTaxonomyDefRoute) {
				const contentType = response.headers.get("content-type") || "";
				if (contentType && !contentType.includes("json")) {
					return response;
				}

				// Safeguard (a): Skip localizing taxonomy definitions when requested from the
				// Taxonomy management screen (`/_emdash/admin/taxonomies...`), while still
				// recording canonical originals in `cachedTaxonomyOriginals` for PUT safeguard (b).
				if (
					isTaxonomyDefRoute &&
					excludeSchemaEditor &&
					isTaxonomyEditorReferer(context.request)
				) {
					if (method === "GET") {
						try {
							const rawData = await response.clone().json();
							for (const tax of extractRawTaxonomies(rawData)) {
								const key = tax?.name || tax?.slug;
								if (key) {
									cachedTaxonomyOriginals.set(key, {
										label: tax.label,
										labelSingular: tax.labelSingular,
										description: tax.description,
									});
								}
							}
						} catch {
							// Ignore parse errors
						}
					}
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
					} else if (isTaxonomyDefRoute) {
						for (const tax of extractRawTaxonomies(data)) {
							const key = tax?.name || tax?.slug;
							if (key) {
								cachedTaxonomyOriginals.set(key, {
									label: tax.label,
									labelSingular: tax.labelSingular,
									description: tax.description,
								});
							}
						}
						localized = localizeTaxonomiesResponse(data, locale, options);
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
