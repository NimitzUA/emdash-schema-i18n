import {
	resolveAdminLocale,
	localizeManifest,
	localizeBlockTypesResponse,
	localizeCollectionsResponse,
} from "./localizer.mjs";

/**
 * Creates an Astro middleware handler that intercepts `/_emdash/api/manifest`,
 * `/_emdash/api/schema/block-types`, and `/_emdash/api/schema/collections`
 * and dynamically localizes the schema JSON according to the admin session language.
 *
 * @param {object} [options]
 * @param {Record<string, Record<string, string>>} [options.dictionary]
 * @param {string} [options.separator=" / "]
 * @param {string} [options.defaultLocale="en"]
 * @returns {(context: any, next: () => Promise<Response>) => Promise<Response>}
 */
export function createLocalizationMiddleware(options = {}) {
	const { defaultLocale = "en" } = options;

	return async function localizationMiddleware(context, next) {
		const response = await next();

		if (response?.status >= 200 && response?.status < 300) {
			const pathname = context.url.pathname;
			const isManifest = pathname === "/_emdash/api/manifest";
			const isBlockTypes = pathname === "/_emdash/api/schema/block-types";
			const isCollections = pathname.startsWith("/_emdash/api/schema/collections");

			if (isManifest || isBlockTypes || isCollections) {
				try {
					const locale = resolveAdminLocale(context.request, defaultLocale);
					const data = await response.clone().json();
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
					headers.set("Vary", "Cookie, Accept-Language");

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
		}

		return response;
	};
}

export default createLocalizationMiddleware;
