import {
	resolveAdminLocale,
	localizeManifest,
	localizeBlockTypesResponse,
	localizeCollectionsResponse,
} from "./localizer.mjs";

export const RELOAD_WATCHER_SCRIPT = `<script id="emdash-i18n-watcher">
(() => {
	if (typeof window === "undefined" || !window.MutationObserver || window.__emdash_i18n_lang_watcher__) return;
	window.__emdash_i18n_lang_watcher__ = true;
	let currentLang = document.documentElement.getAttribute("lang") || "";
	const observer = new MutationObserver(() => {
		const newLang = document.documentElement.getAttribute("lang") || "";
		if (newLang && currentLang && newLang !== currentLang) {
			currentLang = newLang;
			setTimeout(() => { window.location.reload(); }, 60);
		}
	});
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
})();
</script>`;

/**
 * Creates an Astro middleware handler that intercepts `/_emdash/api/manifest`,
 * `/_emdash/api/schema/block-types`, and `/_emdash/api/schema/collections`
 * and dynamically localizes the schema JSON according to the admin session language,
 * and injects an auto-reload watcher on admin HTML pages so switching languages
 * immediately refreshes schema and block types.
 *
 * @param {object} [options]
 * @param {Record<string, Record<string, string>>} [options.dictionary]
 * @param {string} [options.separator=" / "]
 * @param {string} [options.defaultLocale="en"]
 * @param {boolean} [options.autoReloadOnLocaleChange=true]
 * @returns {(context: any, next: () => Promise<Response>) => Promise<Response>}
 */
export function createLocalizationMiddleware(options = {}) {
	const { defaultLocale = "en", autoReloadOnLocaleChange = true } = options;

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

			if (
				autoReloadOnLocaleChange &&
				pathname.startsWith("/_emdash/admin") &&
				response.headers.get("content-type")?.includes("text/html")
			) {
				try {
					const resClone = response.clone();
					const html = await resClone.text();
					if (!html.includes('id="emdash-i18n-watcher"')) {
						const injectedHtml = html.includes("</body>")
							? html.replace("</body>", `${RELOAD_WATCHER_SCRIPT}</body>`)
							: `${html}${RELOAD_WATCHER_SCRIPT}`;
						const headers = new Headers(response.headers);
						headers.delete("content-length");
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

export default createLocalizationMiddleware;
