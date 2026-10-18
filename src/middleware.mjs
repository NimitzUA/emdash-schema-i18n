import {
	normalizeLocale,
	resolveAdminLocale,
	localizeManifest,
	localizeBlockTypesResponse,
	localizeCollectionsResponse,
	localizeTaxonomiesResponse,
	TaxonomyTranslationCache,
	recordTaxonomyTranslations,
	restoreOriginalTaxonomyInput,
	warnOnIdentifierDictionaryKeys,
	installLocaleReloadWatcher,
} from "./localizer.mjs";

export const RELOAD_WATCHER_SCRIPT = `<script id="emdash-i18n-watcher">\n(${installLocaleReloadWatcher.toString()})();\n</script>`;

export const DEFAULT_MAX_RESTORE_BODY_BYTES = 64 * 1024;

const RFC6838_MIME_REGEX =
	/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;

/**
 * Strictly checks whether a Content-Type header represents JSON (`application/json` or `*+json`).
 *
 * @param {string | null | undefined} contentType
 * @returns {boolean}
 */
export function isJsonMimeType(contentType) {
	if (typeof contentType !== "string" || !contentType.trim()) return false;
	const mime = contentType.split(";", 1)[0].trim().toLowerCase();
	if (!RFC6838_MIME_REGEX.test(mime)) return false;
	return mime === "application/json" || mime.endsWith("+json");
}

/**
 * Extracts a session or user identifier from the Astro middleware context so that
 * cached taxonomy translations are isolated per editor session.
 *
 * Priority:
 * 1. `context.locals.user.id` (or `userId`, `sub`, `email`) / `context.locals.session.id` / `context.locals.tokenId`
 * 2. `Authorization` request header
 * 3. Session/auth cookies (`emdash-session`, `astro-session`, etc., excluding `emdash-locale`)
 * 4. Fallback `"anon"`
 *
 * @param {any} context
 * @returns {string}
 */
export function resolveSessionScope(context) {
	const locals = context?.locals;
	const userId =
		locals?.user?.id ??
		locals?.user?.userId ??
		locals?.user?.sub ??
		locals?.user?.email ??
		locals?.session?.id ??
		locals?.tokenId;
	if (userId !== undefined && userId !== null && String(userId).trim()) {
		return `user:${String(userId).trim()}`;
	}

	const headers = context?.request?.headers;
	if (headers && typeof headers.get === "function") {
		const auth = headers.get("authorization")?.trim();
		if (auth) {
			return `auth:${auth}`;
		}

		const cookieHeader = headers.get("cookie") || "";
		if (cookieHeader) {
			const pairs = cookieHeader.split(";");
			for (const pair of pairs) {
				const eqIdx = pair.indexOf("=");
				if (eqIdx === -1) continue;
				const rawName = pair.slice(0, eqIdx).trim();
				const nameLower = rawName.toLowerCase();
				const val = pair.slice(eqIdx + 1).trim();
				if (!val || nameLower === "emdash-locale") continue;
				if (
					nameLower === "emdash-session" ||
					nameLower === "emdash_session" ||
					nameLower === "__host-emdash-session" ||
					nameLower === "astro-session" ||
					nameLower === "session" ||
					nameLower === "session_id" ||
					nameLower === "sid" ||
					nameLower.includes("session") ||
					nameLower.includes("token") ||
					nameLower.includes("auth")
				) {
					return `cookie:${rawName}=${val}`;
				}
			}
		}
	}

	return "anon";
}

const OPTION_SPECS = {
	dictionary: {
		expected: "plain object",
		check: (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v),
	},
	separator: {
		expected: "string",
		check: (v) => typeof v === "string",
	},
	splitBilingual: {
		expected: "boolean",
		check: (v) => typeof v === "boolean",
	},
	separatorLocales: {
		expected: "array of strings",
		check: (v) => Array.isArray(v) && v.every((item) => typeof item === "string"),
	},
	defaultLocale: {
		expected: "non-empty string",
		check: (v) => typeof v === "string" && v.trim().length > 0,
	},
	excludeSchemaEditor: {
		expected: "boolean",
		check: (v) => typeof v === "boolean",
	},
	localizeSchemaCollections: {
		expected: "boolean",
		check: (v) => typeof v === "boolean",
	},
	localizeTaxonomies: {
		expected: "boolean",
		check: (v) => typeof v === "boolean",
	},
	localizeManifestTaxonomies: {
		expected: "boolean",
		check: (v) => typeof v === "boolean",
	},
	restoreTaxonomyLabelsOnWrite: {
		expected: "boolean",
		check: (v) => typeof v === "boolean",
	},
	maxRestoreBodyBytes: {
		expected: "positive number",
		check: (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
	},
	taxonomyCacheMaxSize: {
		expected: "positive number",
		check: (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
	},
	taxonomyCacheTtlMs: {
		expected: "positive number",
		check: (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
	},
	injectHtmlWatcher: {
		expected: "boolean",
		check: (v) => typeof v === "boolean",
	},
	autoReloadOnLocaleChange: {
		expected: "boolean",
		check: (v) => typeof v === "boolean",
	},
	useCookie: {
		expected: "boolean",
		check: (v) => typeof v === "boolean",
	},
	useAcceptLanguage: {
		expected: "boolean",
		check: (v) => typeof v === "boolean",
	},
	allowQueryParam: {
		expected: "boolean",
		check: (v) => typeof v === "boolean",
	},
	preferCookieOverQuery: {
		expected: "boolean",
		check: (v) => typeof v === "boolean",
	},
	now: {
		expected: "function",
		check: (v) => typeof v === "function",
	},
	key: {
		expected: "string",
		check: (v) => typeof v === "string",
	},
};

function describeValueType(val) {
	if (val === null) return "null";
	if (Array.isArray(val)) return "array";
	return typeof val;
}

/**
 * Validates middleware options at startup and logs warnings via `console.warn`
 * for unknown option keys (such as typos like `localiseTaxonomies`) or invalid types.
 *
 * @param {unknown} options
 * @returns {string[]} List of warning messages emitted.
 */
export function validateMiddlewareOptions(options) {
	const warnings = [];
	if (options === undefined) return warnings;
	if (options === null || typeof options !== "object" || Array.isArray(options)) {
		const msg = `[emdash-schema-i18n] Invalid options passed to createLocalizationMiddleware: expected plain object, got ${describeValueType(options)}.`;
		console.warn(msg);
		warnings.push(msg);
		return warnings;
	}

	for (const [key, value] of Object.entries(options)) {
		if (!Object.hasOwn(OPTION_SPECS, key)) {
			const msg = `[emdash-schema-i18n] Unknown option "${key}" passed to createLocalizationMiddleware.`;
			console.warn(msg);
			warnings.push(msg);
			continue;
		}
		if (value === undefined) continue;
		const spec = OPTION_SPECS[key];
		if (!spec.check(value)) {
			const msg = `[emdash-schema-i18n] Invalid value for option "${key}": expected ${spec.expected}, got ${describeValueType(value)}.`;
			console.warn(msg);
			warnings.push(msg);
		}
	}

	return warnings;
}

/**
 * Reads and parses a JSON body from a cloned `Request`, aborting early if the payload
 * exceeds `maxBytes`.
 *
 * @param {Request} reqClone
 * @param {number} maxBytes
 * @returns {Promise<{ ok: true, data: any } | { ok: false }>}
 */
async function readJsonBodyWithLimit(reqClone, maxBytes) {
	if (!reqClone?.body) {
		const text = await reqClone.text();
		if (Buffer.byteLength(text, "utf-8") > maxBytes) {
			return { ok: false };
		}
		return { ok: true, data: JSON.parse(text) };
	}

	const reader = reqClone.body.getReader();
	const chunks = [];
	let totalBytes = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			const chunk = value instanceof Uint8Array ? value : Buffer.from(value);
			totalBytes += chunk.byteLength;
			if (totalBytes > maxBytes) {
				reader.cancel().catch(() => {});
				return { ok: false };
			}
			chunks.push(chunk);
		}
	} finally {
		reader.releaseLock();
	}

	const text = Buffer.concat(chunks, totalBytes).toString("utf-8");
	return { ok: true, data: JSON.parse(text) };
}

function mergeVaryHeader(
	headers,
	{ varyCookie = true, varyAcceptLanguage = false } = {},
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

function getQueryLocaleParam(context) {
	const search = context?.url?.search;
	if (typeof search === "string") {
		const val = new URLSearchParams(search).get("locale")?.trim();
		return val || null;
	}
	if (context?.request?.url) {
		try {
			const val = new URL(context.request.url).searchParams.get("locale")?.trim();
			return val || null;
		} catch {
			return null;
		}
	}
	return null;
}

function hasQueryLocaleParam(context) {
	return Boolean(getQueryLocaleParam(context));
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

/**
 * Creates an Astro middleware handler that intercepts `/_emdash/api/manifest`,
 * `/_emdash/api/schema/block-types`, and (when opted in) `/_emdash/api/taxonomies`
 * and dynamically localizes the schema JSON according to the admin session language.
 *
 * @param {object} [options]
 * @param {Record<string, Record<string, string>>} [options.dictionary]
 * @param {string} [options.separator=" / "]
 * @param {boolean} [options.splitBilingual=true]
 * @param {string[]} [options.separatorLocales=["uk", "en"]]
 * @param {string} [options.defaultLocale="en"]
 * @param {boolean} [options.excludeSchemaEditor=true] Protects Schema Editor (Content Types manager) from receiving translated labels.
 * @param {boolean} [options.localizeSchemaCollections=false] Explicitly allow localizing /schema/collections.
 * @param {boolean} [options.localizeTaxonomies=false] Opt-in: localize taxonomy definitions on GET/HEAD /_emdash/api/taxonomies and /_emdash/api/taxonomies/[name].
 * @param {boolean} [options.localizeManifestTaxonomies] Localize `manifest.taxonomies` (defaults to `localizeTaxonomies` when specified, or `false` by default).
 * @param {boolean} [options.restoreTaxonomyLabelsOnWrite=false] Opt-in: restore original taxonomy labels on PUT/PATCH /_emdash/api/taxonomies/[name] when incoming value matches a translation previously served by GET in the same session.
 * @param {number} [options.maxRestoreBodyBytes=65536] Maximum request body size in bytes to inspect during PUT/PATCH restoration (default 64 KiB).
 * @param {number} [options.taxonomyCacheMaxSize=500] Maximum entries in the taxonomy translation cache.
 * @param {number} [options.taxonomyCacheTtlMs=300000] TTL in milliseconds for cached taxonomy translations (default 5 minutes).
 * @param {boolean} [options.injectHtmlWatcher=false] Inject inline watcher script into admin HTML (unnecessary when adminEntry is loaded).
 * @param {boolean} [options.autoReloadOnLocaleChange] Deprecated alias for injectHtmlWatcher.
 * @param {boolean} [options.useCookie=true] Read `emdash-locale` cookie when resolving locale.
 * @param {boolean} [options.useAcceptLanguage=false] Fall back to `Accept-Language` header when cookie is absent.
 * @param {boolean} [options.allowQueryParam=false] Allow `?locale=` query parameter override for admin locale resolution.
 * @param {boolean} [options.preferCookieOverQuery=false] Give `emdash-locale` cookie higher priority than `?locale=`.
 * @returns {(context: any, next: () => Promise<Response>) => Promise<Response>}
 */
export function createLocalizationMiddleware(options = {}) {
	validateMiddlewareOptions(options);

	const safeOpts =
		options && typeof options === "object" && !Array.isArray(options) ? options : {};

	const defaultLocale =
		typeof safeOpts.defaultLocale === "string" && safeOpts.defaultLocale.trim()
			? safeOpts.defaultLocale
			: "en";
	const excludeSchemaEditor =
		typeof safeOpts.excludeSchemaEditor === "boolean"
			? safeOpts.excludeSchemaEditor
			: true;
	const localizeSchemaCollections =
		typeof safeOpts.localizeSchemaCollections === "boolean"
			? safeOpts.localizeSchemaCollections
			: false;
	const localizeTaxonomies =
		typeof safeOpts.localizeTaxonomies === "boolean"
			? safeOpts.localizeTaxonomies
			: false;
	const localizeManifestTaxonomies =
		typeof safeOpts.localizeManifestTaxonomies === "boolean"
			? safeOpts.localizeManifestTaxonomies
			: localizeTaxonomies;
	const restoreTaxonomyLabelsOnWrite =
		typeof safeOpts.restoreTaxonomyLabelsOnWrite === "boolean"
			? safeOpts.restoreTaxonomyLabelsOnWrite
			: false;
	const maxRestoreBodyBytes =
		typeof safeOpts.maxRestoreBodyBytes === "number" &&
		Number.isFinite(safeOpts.maxRestoreBodyBytes) &&
		safeOpts.maxRestoreBodyBytes > 0
			? safeOpts.maxRestoreBodyBytes
			: DEFAULT_MAX_RESTORE_BODY_BYTES;
	const taxonomyCacheMaxSize =
		typeof safeOpts.taxonomyCacheMaxSize === "number" &&
		Number.isFinite(safeOpts.taxonomyCacheMaxSize) &&
		safeOpts.taxonomyCacheMaxSize > 0
			? safeOpts.taxonomyCacheMaxSize
			: 500;
	const taxonomyCacheTtlMs =
		typeof safeOpts.taxonomyCacheTtlMs === "number" &&
		Number.isFinite(safeOpts.taxonomyCacheTtlMs) &&
		safeOpts.taxonomyCacheTtlMs > 0
			? safeOpts.taxonomyCacheTtlMs
			: 300_000;
	const injectHtmlWatcher =
		typeof safeOpts.injectHtmlWatcher === "boolean"
			? safeOpts.injectHtmlWatcher
			: typeof safeOpts.autoReloadOnLocaleChange === "boolean"
				? safeOpts.autoReloadOnLocaleChange
				: false;
	const useCookie =
		typeof safeOpts.useCookie === "boolean" ? safeOpts.useCookie : true;
	const useAcceptLanguage =
		typeof safeOpts.useAcceptLanguage === "boolean"
			? safeOpts.useAcceptLanguage
			: false;
	const allowQueryParam =
		typeof safeOpts.allowQueryParam === "boolean"
			? safeOpts.allowQueryParam
			: false;
	const preferCookieOverQuery =
		typeof safeOpts.preferCookieOverQuery === "boolean"
			? safeOpts.preferCookieOverQuery
			: false;

	const effectiveOptions = {
		...safeOpts,
		defaultLocale,
		localizeTaxonomies,
		localizeManifestTaxonomies,
	};

	const taxonomyTranslationCache = restoreTaxonomyLabelsOnWrite
		? new TaxonomyTranslationCache({
				maxSize: taxonomyCacheMaxSize,
				ttlMs: taxonomyCacheTtlMs,
				now: typeof safeOpts.now === "function" ? safeOpts.now : undefined,
			})
		: null;

	let manifestIdentifiersChecked = false;
	const warnedIdentifierKeys = new Set();

	return async function localizationMiddleware(context, next) {
		const method = context.request?.method || "GET";
		const pathname = resolvePathname(context);

		// Fast-path: skip all non-EmDash routes immediately
		if (!pathname.startsWith("/_emdash/")) {
			return next();
		}

		// Opt-in write safeguard: On PUT/PATCH to /_emdash/api/taxonomies/[name], restore
		// canonical original label/labelSingular if and only if the incoming value matches
		// the translation previously served by GET for the target record's locale in the same session.
		if (
			restoreTaxonomyLabelsOnWrite &&
			taxonomyTranslationCache &&
			(method === "PUT" || method === "PATCH")
		) {
			const taxName = getSingleTaxonomyName(pathname);
			const originalRequest = context.request;
			const reqContentType = originalRequest?.headers?.get("content-type") || "";

			if (taxName && isJsonMimeType(reqContentType)) {
				const contentLengthHeader = originalRequest.headers?.get("content-length");
				if (
					contentLengthHeader !== null &&
					contentLengthHeader !== undefined &&
					contentLengthHeader.trim() !== ""
				) {
					const contentLength = Number(contentLengthHeader);
					if (
						!Number.isFinite(contentLength) ||
						contentLength < 0 ||
						contentLength > maxRestoreBodyBytes
					) {
						return next();
					}
				}

				try {
					const parsed = await readJsonBodyWithLimit(
						originalRequest.clone(),
						maxRestoreBodyBytes,
					);
					if (!parsed.ok) {
						return next();
					}

					const rawBody = parsed.data;
					const queryLocale = getQueryLocaleParam(context);
					const bodyLocale =
						typeof rawBody?.locale === "string" && rawBody.locale.trim()
							? rawBody.locale.trim()
							: null;

					// If both ?locale= and body.locale are provided and resolve to different locales,
					// do not touch the payload.
					if (
						queryLocale &&
						bodyLocale &&
						normalizeLocale(queryLocale, defaultLocale) !==
							normalizeLocale(bodyLocale, defaultLocale)
					) {
						return next();
					}

					const targetLocale = queryLocale || bodyLocale || defaultLocale;
					const sessionScope = resolveSessionScope(context);

					const { body: restoredBody, changed } = restoreOriginalTaxonomyInput(
						rawBody,
						taxName,
						targetLocale,
						effectiveOptions,
						taxonomyTranslationCache,
						sessionScope,
					);

					if (changed) {
						const newHeaders = new Headers(originalRequest.headers);
						newHeaders.delete("content-length");
						const updatedRequest = new Request(originalRequest.url, {
							method: originalRequest.method,
							headers: newHeaders,
							body: JSON.stringify(restoredBody),
							signal: originalRequest.signal,
						});

						let replaced = false;
						try {
							context.request = updatedRequest;
							replaced = context.request === updatedRequest;
						} catch {
							// Fallback for getter-only context.request
						}
						if (!replaced) {
							Object.defineProperty(context, "request", {
								value: updatedRequest,
								writable: true,
								configurable: true,
								enumerable: true,
							});
						}

						// Cancel the original body stream ONLY after context.request is replaced
						await originalRequest.body?.cancel().catch(() => {});
					}
				} catch {
					// If body parsing or request replacement fails, proceed with untouched original request
				}
			}
			return next();
		}

		// Process only GET and HEAD requests for response localization
		if (method !== "GET" && method !== "HEAD") {
			return next();
		}

		const preNextSessionScope =
			restoreTaxonomyLabelsOnWrite && taxonomyTranslationCache
				? resolveSessionScope(context)
				: "anon";

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
				if (contentType && !isJsonMimeType(contentType)) {
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
						if (!manifestIdentifiersChecked) {
							manifestIdentifiersChecked = true;
							warnOnIdentifierDictionaryKeys(
								data,
								safeOpts.dictionary,
								warnedIdentifierKeys,
							);
						}
						localized = localizeManifest(data, locale, effectiveOptions);
					} else if (isBlockTypes) {
						localized = localizeBlockTypesResponse(data, locale, effectiveOptions);
					} else if (isCollections) {
						localized = localizeCollectionsResponse(data, locale, effectiveOptions);
					} else if (isTaxonomyDefRoute) {
						localized = localizeTaxonomiesResponse(data, locale, effectiveOptions);
						if (restoreTaxonomyLabelsOnWrite && taxonomyTranslationCache) {
							const queryLocale = getQueryLocaleParam(context);
							const postNextSessionScope = resolveSessionScope(context);
							const sessionScope =
								preNextSessionScope !== "anon"
									? preNextSessionScope
									: postNextSessionScope;
							recordTaxonomyTranslations(
								data,
								localized,
								queryLocale || defaultLocale,
								defaultLocale,
								taxonomyTranslationCache,
								sessionScope,
							);
						}
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
