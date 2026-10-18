/**
 * String and Manifest localization engine for EmDash.
 */

const DEFAULT_SEPARATOR = " / ";

const COLLECTION_TEXT_PROPS = ["label", "labelSingular", "description", "group"];
const BLOCK_TYPE_TEXT_PROPS = ["label", "description", "category"];
const FIELD_TEXT_PROPS = ["label", "labelSingular", "description", "placeholder", "hint"];
const TAXONOMY_TEXT_PROPS = ["label", "labelSingular"];

/**
 * Cache of known source phrases per dictionary object reference.
 * Avoids repeated Object.values(dictionary) scans on every string.
 * @type {WeakMap<object, Set<string>>}
 */
const dictionaryPhrasesCache = new WeakMap();

/**
 * Returns a cached Set of all source keys across all locales in a dictionary.
 *
 * @param {Record<string, Record<string, string>>} dictionary
 * @returns {Set<string>}
 */
function getKnownDictionaryPhrases(dictionary) {
	let cached = dictionaryPhrasesCache.get(dictionary);
	if (cached) return cached;

	cached = new Set();
	for (const localeEntries of Object.values(dictionary)) {
		if (localeEntries && typeof localeEntries === "object") {
			for (const phrase of Object.keys(localeEntries)) {
				cached.add(phrase);
			}
		}
	}
	dictionaryPhrasesCache.set(dictionary, cached);
	return cached;
}

/**
 * Installs a DOM MutationObserver on `document.documentElement[lang]`
 * that reloads the admin page when the user switches the interface language.
 */
export function installLocaleReloadWatcher() {
	if (
		typeof window === "undefined" ||
		typeof window.MutationObserver === "undefined" ||
		window.__emdash_i18n_lang_watcher__
	) {
		return;
	}
	window.__emdash_i18n_lang_watcher__ = true;
	let currentLang = document.documentElement.getAttribute("lang") || "";
	const observer = new MutationObserver(() => {
		const newLang = document.documentElement.getAttribute("lang") || "";
		if (!newLang) return;
		if (!currentLang) {
			currentLang = newLang;
			return;
		}
		if (newLang !== currentLang) {
			currentLang = newLang;
			setTimeout(() => {
				window.location.reload();
			}, 60);
		}
	});
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["lang"],
	});
}

function extractQueryLocale(request, fallback) {
	try {
		const url = new URL(request.url);
		const queryLocale = url.searchParams.get("locale")?.trim();
		if (queryLocale) return normalizeLocale(queryLocale, fallback);
	} catch {
		// Ignore invalid URLs
	}
	return null;
}

function extractCookieLocale(request, fallback) {
	const cookieHeader = request.headers.get("cookie") || "";
	const cookieMatch = cookieHeader.match(/(?:^|;\s*)emdash-locale=([^;]+)/);
	if (cookieMatch?.[1]) {
		try {
			return normalizeLocale(decodeURIComponent(cookieMatch[1].trim()), fallback);
		} catch {
			return normalizeLocale(cookieMatch[1].trim(), fallback);
		}
	}
	return null;
}

/**
 * Resolves the admin UI locale from an incoming HTTP Request.
 *
 * Precedence (default):
 * 1. Cookie `emdash-locale` (unless `options.useCookie === false`)
 * 2. Query parameter `locale` (only when `options.allowQueryParam === true`; checked before cookie unless `options.preferCookieOverQuery === true`)
 * 3. Header `Accept-Language` (only when `options.useAcceptLanguage === true`)
 * 4. Fallback `defaultLocale` (default `"en"`)
 *
 * @param {Request} request
 * @param {string} [defaultLocale="en"]
 * @param {object} [options]
 * @param {boolean} [options.useCookie=true]
 * @param {boolean} [options.useAcceptLanguage=false]
 * @param {boolean} [options.allowQueryParam=false]
 * @param {boolean} [options.preferCookieOverQuery=false]
 * @returns {string}
 */
export function resolveAdminLocale(request, defaultLocale = "en", options = {}) {
	const fallback = normalizeLocale(defaultLocale, "en");
	if (!request) return fallback;

	const {
		useCookie = true,
		useAcceptLanguage = false,
		allowQueryParam = false,
		preferCookieOverQuery = false,
	} = options;

	if (preferCookieOverQuery) {
		if (useCookie) {
			const cookieLoc = extractCookieLocale(request, fallback);
			if (cookieLoc) return cookieLoc;
		}
		if (allowQueryParam) {
			const queryLoc = extractQueryLocale(request, fallback);
			if (queryLoc) return queryLoc;
		}
	} else {
		if (allowQueryParam) {
			const queryLoc = extractQueryLocale(request, fallback);
			if (queryLoc) return queryLoc;
		}
		if (useCookie) {
			const cookieLoc = extractCookieLocale(request, fallback);
			if (cookieLoc) return cookieLoc;
		}
	}

	if (useAcceptLanguage) {
		const acceptLanguage = request.headers.get("accept-language");
		if (acceptLanguage) {
			const candidates = acceptLanguage
				.split(",")
				.map((entry, idx) => {
					const [rawLang, ...params] = entry.trim().split(";");
					const lang = rawLang?.trim();
					let q = 1;
					for (const param of params) {
						const [k, v] = param.trim().split("=");
						if (k === "q" && v !== undefined) {
							const parsed = Number.parseFloat(v);
							if (!Number.isNaN(parsed)) q = parsed;
						}
					}
					return { lang, q, idx };
				})
				.filter((item) => item.lang && item.lang !== "*" && item.q > 0)
				.sort((a, b) => b.q - a.q || a.idx - b.idx);

			if (candidates.length > 0) {
				return normalizeLocale(candidates[0].lang, fallback);
			}
		}
	}

	return fallback;
}

/**
 * Normalizes locale code to base language (e.g. "uk-UA" -> "uk", "uk_UA" -> "uk", "en-US" -> "en").
 *
 * @param {string} code
 * @param {string} [defaultLocale="en"]
 * @returns {string}
 */
export function normalizeLocale(code, defaultLocale = "en") {
	const fallback =
		defaultLocale && typeof defaultLocale === "string"
			? defaultLocale.trim().toLowerCase().split(/[-_]/)[0] || "en"
			: "en";
	if (!code || typeof code !== "string") return fallback;
	const trimmed = code.trim().toLowerCase();
	if (!trimmed) return fallback;
	return trimmed.split(/[-_]/)[0] || fallback;
}

/**
 * Localizes a single string or object value.
 *
 * Supported formats:
 * 1. Explicit dictionary override by key: `options.dictionary[locale][key]`
 * 2. Phrase dictionary lookup by value: `options.dictionary[locale][value]`
 * 3. Multi-language object: `{ uk: "Українська", en: "English" }`
 * 4. Delimited string: `"Українська / English"`
 *
 * @param {unknown} value
 * @param {string} locale
 * @param {object} [options]
 * @param {string} [options.key]
 * @param {Record<string, Record<string, string>>} [options.dictionary]
 * @param {string} [options.separator=" / "]
 * @param {boolean} [options.splitBilingual=true]
 * @param {string[]} [options.separatorLocales=["uk", "en"]]
 * @param {string} [options.defaultLocale="en"]
 * @returns {unknown}
 */
export function localizeString(value, locale, options = {}) {
	const {
		key,
		dictionary,
		separator = DEFAULT_SEPARATOR,
		splitBilingual = true,
		separatorLocales = ["uk", "en"],
		defaultLocale = "en",
	} = options;
	const currentLocale = normalizeLocale(locale, defaultLocale);

	const localeDict =
		dictionary &&
		typeof dictionary === "object" &&
		Object.hasOwn(dictionary, currentLocale)
			? dictionary[currentLocale]
			: undefined;

	// 1. Check explicit dictionary by key (e.g. "collections.case_study.label")
	if (
		key &&
		localeDict &&
		typeof localeDict === "object" &&
		Object.hasOwn(localeDict, key) &&
		localeDict[key]
	) {
		return localeDict[key];
	}

	// 2. Check dictionary by string value (e.g. "Case studies" -> "Кейси")
	if (
		typeof value === "string" &&
		localeDict &&
		typeof localeDict === "object" &&
		Object.hasOwn(localeDict, value) &&
		localeDict[value]
	) {
		return localeDict[value];
	}

	// 3. Object with language keys: { uk: "...", en: "..." }
	if (value && typeof value === "object" && !Array.isArray(value)) {
		const obj = /** @type {Record<string, any>} */ (value);
		if (Object.hasOwn(obj, currentLocale) && obj[currentLocale] !== undefined) {
			return obj[currentLocale];
		}
		if (Object.hasOwn(obj, "en") && obj.en !== undefined) return obj.en;
		if (Object.hasOwn(obj, "uk") && obj.uk !== undefined) return obj.uk;
		return value;
	}

	if (typeof value !== "string") return value;

	// 4. Delimited string: "Українська / English"
	if (splitBilingual && separator && value.includes(separator)) {
		// If the string is registered as a source phrase in any locale dictionary
		// (e.g. dictionary.uk["Before / after"]), treat it as a canonical phrase rather
		// than a bilingual "uk / en" string when rendering untranslated/default locales.
		if (
			dictionary &&
			typeof dictionary === "object" &&
			getKnownDictionaryPhrases(dictionary).has(value)
		) {
			return value;
		}

		const parts = value.split(separator);
		// Only split if exactly 2 parts and 2 locales configured
		if (parts.length === 2 && Array.isArray(separatorLocales) && separatorLocales.length === 2) {
			const firstLocale = normalizeLocale(separatorLocales[0]);
			const secondLocale = normalizeLocale(separatorLocales[1]);
			if (currentLocale.startsWith(firstLocale)) {
				return parts[0].trim();
			}
			if (currentLocale.startsWith(secondLocale)) {
				return parts[1].trim();
			}
			// If active locale is neither of separatorLocales, preserve original string
			return value;
		}
	}

	return value;
}

/**
 * Localizes a list of named properties on an object in place.
 *
 * @param {Record<string, any>} target
 * @param {string[]} propNames
 * @param {string} keyPrefix
 * @param {string} locale
 * @param {object} options
 */
function localizeObjectProps(target, propNames, keyPrefix, locale, options) {
	for (const prop of propNames) {
		if (target[prop]) {
			target[prop] = localizeString(target[prop], locale, {
				...options,
				key: `${keyPrefix}.${prop}`,
			});
		}
	}
}

/**
 * Localizes fields whether stored as a keyed map `{ [slug]: fieldDef }` or an array `fieldDef[]`.
 *
 * @param {any} fields
 * @param {string} parentKey
 * @param {string} locale
 * @param {object} options
 * @returns {any}
 */
function localizeFieldsCollection(fields, parentKey, locale, options) {
	if (Array.isArray(fields)) {
		return fields.map((fld) => localizeSingleField(fld, parentKey, locale, options));
	}
	if (fields && typeof fields === "object") {
		const newFields = {};
		for (const [fSlug, fieldDef] of Object.entries(fields)) {
			if (!fieldDef || typeof fieldDef !== "object") {
				newFields[fSlug] = fieldDef;
				continue;
			}
			newFields[fSlug] = localizeSingleField(fieldDef, parentKey, locale, options, fSlug);
		}
		return newFields;
	}
	return fields;
}

/**
 * Localizes an array of select/multiSelect options.
 * Plain-string options are identifiers (value === label) and are NEVER localized.
 * Object options (`{ value, label }`) localize only `label`, preserving `value` verbatim.
 *
 * @param {any[]} optionsArray
 * @param {string} keyPrefix
 * @param {string} locale
 * @param {object} options
 * @returns {any[]}
 */
function localizeOptionsArray(optionsArray, keyPrefix, locale, options) {
	return optionsArray.map((opt, idx) => {
		if (typeof opt === "string") {
			return opt;
		}
		if (opt && typeof opt === "object" && opt.label) {
			return {
				...opt,
				label: localizeString(opt.label, locale, {
					...options,
					key: `${keyPrefix}.${opt.value ?? idx}.label`,
				}),
			};
		}
		return opt;
	});
}

/**
 * Recursively localizes EmDash Manifest collections, fields, block types, menus, taxonomies, and plugins.
 *
 * @param {any} manifest
 * @param {string} locale
 * @param {object} [options]
 * @param {Record<string, Record<string, string>>} [options.dictionary]
 * @param {string} [options.separator=" / "]
 * @returns {any}
 */
export function localizeManifest(manifest, locale, options = {}) {
	if (!manifest || typeof manifest !== "object") return manifest;

	// Handle wrapped API envelope: { success: true, data: { collections: ... } }
	if (manifest.data && typeof manifest.data === "object" && !Array.isArray(manifest.data)) {
		return {
			...manifest,
			data: localizeManifest(manifest.data, locale, options),
		};
	}

	const localized = { ...manifest };

	// 1. Localize Collections
	if (localized.collections && typeof localized.collections === "object") {
		const newCollections = {};
		for (const [colSlug, colDef] of Object.entries(localized.collections)) {
			newCollections[colSlug] = localizeSingleCollection(colDef, locale, options, colSlug);
		}
		localized.collections = newCollections;
	}

	// 2. Localize Block Types
	if (Array.isArray(localized.blockTypes)) {
		localized.blockTypes = localized.blockTypes.map((bt) => localizeSingleBlockType(bt, locale, options));
	}

	// 3. Localize Menus (`menu.name` is an identifier and is never localized; only `menu.label` if present)
	if (Array.isArray(localized.menus)) {
		localized.menus = localized.menus.map((menu) => {
			if (!menu || typeof menu !== "object") return menu;
			if (!menu.label) return menu;
			const m = { ...menu };
			m.label = localizeString(m.label, locale, {
				...options,
				key: `menus.${m.slug || m.id || m.name}.label`,
			});
			return m;
		});
	}

	// 4. Localize Taxonomies (controlled by localizeManifestTaxonomies ?? localizeTaxonomies ?? true)
	const shouldLocalizeManifestTaxonomies =
		options.localizeManifestTaxonomies ?? options.localizeTaxonomies ?? true;
	if (shouldLocalizeManifestTaxonomies && Array.isArray(localized.taxonomies)) {
		localized.taxonomies = localized.taxonomies.map((tax) =>
			localizeSingleTaxonomy(tax, locale, options),
		);
	}

	// 5. Localize Plugin UI contributions (adminPages, dashboardWidgets, fieldWidgets, portableTextBlocks)
	if (localized.plugins && typeof localized.plugins === "object" && !Array.isArray(localized.plugins)) {
		const newPlugins = {};
		for (const [pluginId, pluginDef] of Object.entries(localized.plugins)) {
			if (!pluginDef || typeof pluginDef !== "object") {
				newPlugins[pluginId] = pluginDef;
				continue;
			}
			newPlugins[pluginId] = localizeManifestPlugin(pluginDef, pluginId, locale, options);
		}
		localized.plugins = newPlugins;
	}

	return localized;
}

function localizeManifestPlugin(pluginDef, pluginId, locale, options) {
	const p = { ...pluginDef };
	const prefix = `plugins.${pluginId}`;

	if (Array.isArray(p.adminPages)) {
		p.adminPages = p.adminPages.map((page, idx) => {
			if (!page || typeof page !== "object") return page;
			const pg = { ...page };
			localizeObjectProps(pg, ["label", "group"], `${prefix}.adminPages.${pg.path || idx}`, locale, options);
			return pg;
		});
	}

	if (Array.isArray(p.dashboardWidgets)) {
		p.dashboardWidgets = p.dashboardWidgets.map((widget, idx) => {
			if (!widget || typeof widget !== "object") return widget;
			const w = { ...widget };
			localizeObjectProps(w, ["title"], `${prefix}.dashboardWidgets.${w.id || idx}`, locale, options);
			return w;
		});
	}

	if (Array.isArray(p.fieldWidgets)) {
		p.fieldWidgets = p.fieldWidgets.map((fw, idx) => {
			if (!fw || typeof fw !== "object") return fw;
			const w = { ...fw };
			localizeObjectProps(w, ["label"], `${prefix}.fieldWidgets.${w.name || idx}`, locale, options);
			return w;
		});
	}

	if (Array.isArray(p.portableTextBlocks)) {
		p.portableTextBlocks = p.portableTextBlocks.map((ptb, idx) => {
			if (!ptb || typeof ptb !== "object") return ptb;
			const b = { ...ptb };
			localizeObjectProps(
				b,
				["label", "description", "placeholder"],
				`${prefix}.portableTextBlocks.${b.type || idx}`,
				locale,
				options,
			);
			return b;
		});
	}

	if (Array.isArray(p.editorPanels)) {
		p.editorPanels = p.editorPanels.map((panel, idx) => {
			if (!panel || typeof panel !== "object") return panel;
			const ep = { ...panel };
			localizeObjectProps(
				ep,
				["label", "title", "description"],
				`${prefix}.editorPanels.${ep.id || ep.name || idx}`,
				locale,
				options,
			);
			return ep;
		});
	}

	if (Array.isArray(p.editorActions)) {
		p.editorActions = p.editorActions.map((action, idx) => {
			if (!action || typeof action !== "object") return action;
			const ea = { ...action };
			localizeObjectProps(
				ea,
				["label", "title", "description"],
				`${prefix}.editorActions.${ea.id || ea.name || idx}`,
				locale,
				options,
			);
			return ea;
		});
	}

	return p;
}

/**
 * Generic API envelope unwrapper for list and single-item schema responses.
 *
 * @param {any} data
 * @param {(item: any) => any} localizeItem
 * @param {(item: any) => boolean} isDirectItem
 * @returns {any}
 */
function localizeSchemaEnvelope(data, localizeItem, isDirectItem) {
	if (!data || typeof data !== "object") return data;

	if (data.data && typeof data.data === "object" && !Array.isArray(data.data)) {
		return {
			...data,
			data: localizeSchemaEnvelope(data.data, localizeItem, isDirectItem),
		};
	}

	if (Array.isArray(data.items)) {
		return {
			...data,
			items: data.items.map(localizeItem),
		};
	}

	if (Array.isArray(data.taxonomies)) {
		return {
			...data,
			taxonomies: data.taxonomies.map(localizeItem),
		};
	}

	if (Array.isArray(data)) {
		return data.map(localizeItem);
	}

	if (data.item && typeof data.item === "object" && !Array.isArray(data.item)) {
		return {
			...data,
			item: localizeItem(data.item),
		};
	}

	if (
		data.taxonomy &&
		typeof data.taxonomy === "object" &&
		!Array.isArray(data.taxonomy)
	) {
		return {
			...data,
			taxonomy: localizeItem(data.taxonomy),
		};
	}

	if (isDirectItem(data)) {
		return localizeItem(data);
	}

	return data;
}

/**
 * Localizes block types list / response (GET /_emdash/api/schema/block-types).
 *
 * @param {any} data
 * @param {string} locale
 * @param {object} [options]
 * @returns {any}
 */
export function localizeBlockTypesResponse(data, locale, options = {}) {
	return localizeSchemaEnvelope(
		data,
		(bt) => localizeSingleBlockType(bt, locale, options),
		(d) => Boolean(d.slug || d.type || d.name),
	);
}

/**
 * Localizes a single block type response (GET /_emdash/api/schema/block-types/[slug]).
 */
export const localizeBlockTypeResponse = localizeBlockTypesResponse;

function localizeSingleBlockType(bt, locale, options = {}) {
	if (!bt || typeof bt !== "object") return bt;
	const block = { ...bt };
	const btSlug = block.slug || block.type || block.name || "unknown";
	const keyPrefix = `blockTypes.${btSlug}`;

	localizeObjectProps(block, BLOCK_TYPE_TEXT_PROPS, keyPrefix, locale, options);

	if (block.fields) {
		block.fields = localizeFieldsCollection(block.fields, keyPrefix, locale, options);
	}

	if (Array.isArray(block.versions)) {
		block.versions = block.versions.map((ver) => {
			if (!ver || !ver.fields) return ver;
			return {
				...ver,
				fields: localizeFieldsCollection(ver.fields, keyPrefix, locale, options),
			};
		});
	}

	return block;
}

function localizeSingleField(fld, parentKey, locale, options = {}, fallbackSlug = undefined) {
	if (!fld || typeof fld !== "object") return fld;
	const field = { ...fld };
	const fSlug = field.slug || fallbackSlug || "unknown";
	const fieldKeyPrefix = `${parentKey}.fields.${fSlug}`;

	localizeObjectProps(field, FIELD_TEXT_PROPS, fieldKeyPrefix, locale, options);

	// Options for select / multiSelect
	if (Array.isArray(field.options)) {
		field.options = localizeOptionsArray(field.options, `${fieldKeyPrefix}.options`, locale, options);
	}

	if (field.validation && typeof field.validation === "object") {
		let validationChanged = false;
		const newValidation = { ...field.validation };

		if (Array.isArray(newValidation.options)) {
			newValidation.options = localizeOptionsArray(
				newValidation.options,
				`${fieldKeyPrefix}.options`,
				locale,
				options,
			);
			validationChanged = true;
		}

		if (newValidation.subFields) {
			newValidation.subFields = localizeFieldsCollection(
				newValidation.subFields,
				fieldKeyPrefix,
				locale,
				options,
			);
			validationChanged = true;
		}

		if (validationChanged) {
			field.validation = newValidation;
		}
	}

	// Subfields (repeaters, groups)
	if (field.fields) {
		field.fields = localizeFieldsCollection(field.fields, fieldKeyPrefix, locale, options);
	}

	// Block types inside blocks fields (e.g. case_study.fields.blocks.blockTypes)
	if (Array.isArray(field.blockTypes)) {
		field.blockTypes = field.blockTypes.map((bt) => localizeSingleBlockType(bt, locale, options));
	}

	return field;
}

/**
 * Localizes collections list / response (GET /_emdash/api/schema/collections).
 *
 * @param {any} data
 * @param {string} locale
 * @param {object} [options]
 * @returns {any}
 */
export function localizeCollectionsResponse(data, locale, options = {}) {
	return localizeSchemaEnvelope(
		data,
		(col) => localizeSingleCollection(col, locale, options),
		(d) => Boolean(d.slug || d.label),
	);
}

function localizeSingleCollection(col, locale, options = {}, fallbackSlug = undefined) {
	if (!col || typeof col !== "object") return col;
	const c = { ...col };
	const cSlug = c.slug || fallbackSlug || "unknown";
	const keyPrefix = `collections.${cSlug}`;

	localizeObjectProps(c, COLLECTION_TEXT_PROPS, keyPrefix, locale, options);

	if (c.fields) {
		c.fields = localizeFieldsCollection(c.fields, keyPrefix, locale, options);
	}

	return c;
}

/**
 * Localizes taxonomy definitions list / response (GET /_emdash/api/taxonomies and /_emdash/api/taxonomies/[name]).
 *
 * @param {any} data
 * @param {string} locale
 * @param {object} [options]
 * @returns {any}
 */
export function localizeTaxonomiesResponse(data, locale, options = {}) {
	return localizeSchemaEnvelope(
		data,
		(tax) => localizeSingleTaxonomy(tax, locale, options),
		(d) => Boolean(d.name || d.slug || d.label),
	);
}

/**
 * Localizes a single taxonomy definition response (GET /_emdash/api/taxonomies/[name]).
 */
export const localizeTaxonomyResponse = localizeTaxonomiesResponse;

function localizeSingleTaxonomy(tax, locale, options = {}, fallbackSlug = undefined) {
	if (!tax || typeof tax !== "object") return tax;
	const t = { ...tax };
	const taxSlug = t.name || t.slug || t.id || fallbackSlug || "unknown";
	localizeObjectProps(t, TAXONOMY_TEXT_PROPS, `taxonomies.${taxSlug}`, locale, options);
	return t;
}

/**
 * Extracts raw taxonomy definition objects from an API response envelope so their
 * canonical labels can be cached before localization.
 *
 * @param {any} data
 * @returns {any[]}
 */
export function extractRawTaxonomies(data) {
	if (!data || typeof data !== "object") return [];
	if (data.data && typeof data.data === "object" && !Array.isArray(data.data)) {
		return extractRawTaxonomies(data.data);
	}
	if (Array.isArray(data.taxonomies)) return data.taxonomies;
	if (Array.isArray(data.items)) return data.items;
	if (Array.isArray(data)) return data;
	if (data.taxonomy && typeof data.taxonomy === "object") return [data.taxonomy];
	if (data.item && typeof data.item === "object") return [data.item];
	if (data.name || data.slug) return [data];
	return [];
}

/**
 * Bounded TTL cache storing `{ served -> original }` mappings for taxonomy definition
 * fields that middleware localized during `GET /_emdash/api/taxonomies...` responses.
 *
 * Keyed by `sessionScope + name + locale + field` where `locale` is the target taxonomy
 * definition record's locale (from `taxonomy.locale` / `?locale=` / `defaultLocale`).
 */
export class TaxonomyTranslationCache {
	/**
	 * @param {object} [options]
	 * @param {number} [options.maxSize=500] Maximum number of field entries to retain.
	 * @param {number} [options.ttlMs=300000] Entry time-to-live in milliseconds (default 5 minutes).
	 * @param {() => number} [options.now] Clock function for deterministic testing.
	 */
	constructor({ maxSize = 500, ttlMs = 300_000, now = () => Date.now() } = {}) {
		this.maxSize = Math.max(1, maxSize);
		this.ttlMs = Math.max(1, ttlMs);
		this.now = now;
		/** @type {Map<string, { served: string, original: string, expiresAt: number }>} */
		this.entries = new Map();
	}

	/**
	 * @param {string} name
	 * @param {string} locale
	 * @param {string} field
	 * @param {string} [sessionScope="anon"]
	 * @returns {string}
	 */
	makeKey(name, locale, field, sessionScope = "anon") {
		return `${sessionScope || "anon"}\0${name}\0${locale}\0${field}`;
	}

	/**
	 * Removes expired entries from the map.
	 * @param {number} [currentTime]
	 */
	pruneExpired(currentTime = this.now()) {
		for (const [key, entry] of this.entries) {
			if (currentTime > entry.expiresAt) {
				this.entries.delete(key);
			}
		}
	}

	/**
	 * Records that for `(sessionScope, name, locale, field)`, middleware replaced `original` with `served`.
	 *
	 * @param {string} name
	 * @param {string} locale
	 * @param {string} field
	 * @param {string} served
	 * @param {string} original
	 * @param {string} [sessionScope="anon"]
	 */
	set(name, locale, field, served, original, sessionScope = "anon") {
		if (
			!name ||
			!locale ||
			!field ||
			typeof served !== "string" ||
			typeof original !== "string" ||
			served === original
		) {
			return;
		}
		const currentTime = this.now();
		const key = this.makeKey(name, locale, field, sessionScope);

		if (this.entries.has(key)) {
			this.entries.delete(key);
		} else if (this.entries.size >= this.maxSize) {
			this.pruneExpired(currentTime);
			while (this.entries.size >= this.maxSize) {
				const oldestKey = this.entries.keys().next().value;
				if (oldestKey === undefined) break;
				this.entries.delete(oldestKey);
			}
		}

		this.entries.set(key, {
			served,
			original,
			expiresAt: currentTime + this.ttlMs,
		});
	}

	/**
	 * Returns `original` if and only if `(sessionScope, name, locale, field)` has a non-expired
	 * entry whose `served` value equals `incomingValue`.
	 *
	 * @param {string} name
	 * @param {string} locale
	 * @param {string} field
	 * @param {string} incomingValue
	 * @param {string} [sessionScope="anon"]
	 * @returns {string | undefined}
	 */
	getOriginal(name, locale, field, incomingValue, sessionScope = "anon") {
		const key = this.makeKey(name, locale, field, sessionScope);
		const entry = this.entries.get(key);
		if (!entry) return undefined;

		if (this.now() > entry.expiresAt) {
			this.entries.delete(key);
			return undefined;
		}

		return entry.served === incomingValue ? entry.original : undefined;
	}

	/**
	 * Removes a cached entry for `(sessionScope, name, locale, field)`.
	 *
	 * @param {string} name
	 * @param {string} locale
	 * @param {string} field
	 * @param {string} [sessionScope="anon"]
	 */
	delete(name, locale, field, sessionScope = "anon") {
		this.entries.delete(this.makeKey(name, locale, field, sessionScope));
	}

	get size() {
		return this.entries.size;
	}
}

/**
 * Records `{ served -> original }` translations in `cache` for each taxonomy definition
 * whose `label` or `labelSingular` was rewritten by `localizeTaxonomiesResponse`.
 *
 * @param {any} rawData
 * @param {any} localizedData
 * @param {string | undefined} fallbackRowLocale
 * @param {string} defaultLocale
 * @param {TaxonomyTranslationCache | null | undefined} cache
 * @param {string | string[]} [sessionScopes="anon"]
 */
export function recordTaxonomyTranslations(
	rawData,
	localizedData,
	fallbackRowLocale,
	defaultLocale,
	cache,
	sessionScopes = "anon",
) {
	if (!cache) return;
	const rawList = extractRawTaxonomies(rawData);
	const locList = extractRawTaxonomies(localizedData);
	const normDefault = normalizeLocale(defaultLocale, "en");
	const normFallback = normalizeLocale(fallbackRowLocale || normDefault, normDefault);
	const scopes = Array.isArray(sessionScopes)
		? [...new Set(sessionScopes.filter(Boolean))]
		: [sessionScopes || "anon"];

	for (let i = 0; i < rawList.length; i++) {
		const rawTax = rawList[i];
		const locTax = locList[i];
		if (!rawTax || !locTax || typeof rawTax !== "object" || typeof locTax !== "object") {
			continue;
		}
		const taxName = rawTax.name || rawTax.slug;
		if (!taxName) continue;

		const rowLocale =
			typeof rawTax.locale === "string" && rawTax.locale.trim()
				? normalizeLocale(rawTax.locale, normDefault)
				: normFallback;

		for (const prop of TAXONOMY_TEXT_PROPS) {
			const origVal = rawTax[prop];
			const servedVal = locTax[prop];
			if (typeof origVal === "string" && typeof servedVal === "string" && servedVal !== origVal) {
				for (const scope of scopes) {
					cache.set(taxName, rowLocale, prop, servedVal, origVal, scope);
				}
			}
		}
	}
}

/**
 * Restores canonical original `label` and `labelSingular` on a taxonomy definition
 * update payload (`PUT /_emdash/api/taxonomies/[name]`) if and only if the incoming
 * value matches the translation previously served by `GET` for `(sessionScope, taxonomyName, targetLocale, field)`.
 *
 * @param {any} input
 * @param {string} taxonomyName
 * @param {string} targetLocale Target definition record's locale (from `?locale=` or `defaultLocale`).
 * @param {object} [options]
 * @param {TaxonomyTranslationCache | null | undefined} [cache]
 * @param {string} [sessionScope="anon"]
 * @returns {{ body: any, changed: boolean }}
 */
export function restoreOriginalTaxonomyInput(
	input,
	taxonomyName,
	targetLocale,
	options = {},
	cache = undefined,
	sessionScope = "anon",
) {
	if (!input || typeof input !== "object" || Array.isArray(input) || !cache) {
		return { body: input, changed: false };
	}

	const defaultLocale = options.defaultLocale || "en";
	const rowLocale = normalizeLocale(targetLocale || defaultLocale, defaultLocale);

	let changed = false;
	const restored = { ...input };

	for (const prop of TAXONOMY_TEXT_PROPS) {
		const incomingVal = restored[prop];
		if (typeof incomingVal !== "string" || !incomingVal) continue;

		const origVal = cache.getOriginal(taxonomyName, rowLocale, prop, incomingVal, sessionScope);
		if (typeof origVal === "string" && origVal !== incomingVal) {
			restored[prop] = origVal;
			changed = true;
		} else {
			// Deliberate write with a new value: invalidate any stale cached entry for this field
			cache.delete(taxonomyName, rowLocale, prop, sessionScope);
		}
	}

	return { body: restored, changed };
}

const SEED_TARGET_KEYS = new Set([
	"label",
	"labelSingular",
	"description",
	"category",
	"group",
	"placeholder",
	"hint",
]);

/**
 * Extracts all translatable canonical source strings from an EmDash `seed` object.
 *
 * @param {any} seed
 * @param {object} [options]
 * @param {Set<string>} [options.knownPhrases] Existing dictionary source phrases that should not be split on `" / "`.
 * @param {boolean} [options.cleanSeed=false] Whether to strip bilingual `" / "` prefixes in-place on `seed`.
 * @returns {{ keys: string[], inlineTranslations: Map<string, string> }}
 */
export function extractSeedStrings(seed, options = {}) {
	const { knownPhrases = new Set(), cleanSeed = false } = options;
	/** @type {Set<string>} */
	const keysSet = new Set();
	/** @type {Map<string, string>} */
	const inlineTranslations = new Map();

	if (!seed || typeof seed !== "object") {
		return { keys: [], inlineTranslations };
	}

	function processString(str, parentObj, key) {
		if (!str || typeof str !== "string") return str;
		const trimmed = str.trim();
		if (!trimmed) return str;

		if (str.includes(" / ") && !knownPhrases.has(trimmed)) {
			const parts = str.split(" / ");
			if (parts.length === 2) {
				const firstPart = parts[0].trim();
				const en = parts[1].trim();
				if (en) {
					keysSet.add(en);
					if (firstPart && !inlineTranslations.has(en)) {
						inlineTranslations.set(en, firstPart);
					}
					if (cleanSeed && parentObj && key !== undefined) {
						parentObj[key] = en;
					}
					return en;
				}
			}
		}

		keysSet.add(trimmed);
		return trimmed;
	}

	function deepWalk(obj) {
		if (!obj || typeof obj !== "object") return;
		if (Array.isArray(obj)) {
			for (const item of obj) {
				if (item && typeof item === "object") {
					deepWalk(item);
				}
			}
			return;
		}
		for (const [k, v] of Object.entries(obj)) {
			if (typeof v === "string" && SEED_TARGET_KEYS.has(k)) {
				processString(v, obj, k);
			} else if (typeof v === "object" && v !== null) {
				deepWalk(v);
			}
		}
	}

	if (Array.isArray(seed.blockTypes)) {
		deepWalk(seed.blockTypes);
	} else if (seed.blockTypes && typeof seed.blockTypes === "object") {
		deepWalk(seed.blockTypes);
	}

	if (Array.isArray(seed.collections)) {
		deepWalk(seed.collections);
	} else if (seed.collections && typeof seed.collections === "object") {
		deepWalk(seed.collections);
	}

	const taxonomyEntries = Array.isArray(seed.taxonomies)
		? seed.taxonomies
		: seed.taxonomies && typeof seed.taxonomies === "object"
			? Object.values(seed.taxonomies)
			: [];
	for (const tax of taxonomyEntries) {
		if (tax && typeof tax === "object") {
			if (typeof tax.label === "string") {
				processString(tax.label, tax, "label");
			}
			if (typeof tax.labelSingular === "string") {
				processString(tax.labelSingular, tax, "labelSingular");
			}
		}
	}

	// Menus: menu.name is an identifier and is never extracted; only menu.label if present
	if (Array.isArray(seed.menus)) {
		for (const menu of seed.menus) {
			if (menu && typeof menu === "object" && typeof menu.label === "string") {
				processString(menu.label, menu, "label");
			}
		}
	}

	return { keys: [...keysSet], inlineTranslations };
}

/**
 * Collects plain-string select option values and menu names from a seed or manifest object,
 * and warns once via `console.warn` if any dictionary phrase key equals one of those identifiers.
 *
 * @param {any} schema Seed or manifest object.
 * @param {Record<string, Record<string, string>> | undefined} dictionary
 * @param {Set<string>} [warnedKeys]
 * @returns {string[]} List of warning messages emitted.
 */
export function warnOnIdentifierDictionaryKeys(
	schema,
	dictionary,
	warnedKeys = new Set(),
) {
	const warnings = [];
	if (!schema || typeof schema !== "object" || !dictionary || typeof dictionary !== "object") {
		return warnings;
	}

	const root =
		schema.data && typeof schema.data === "object" && !Array.isArray(schema.data)
			? schema.data
			: schema;

	/** @type {Set<string>} */
	const optionValues = new Set();
	/** @type {Set<string>} */
	const menuNames = new Set();

	function scanForOptionValues(obj) {
		if (!obj || typeof obj !== "object") return;
		if (Array.isArray(obj)) {
			for (const item of obj) {
				if (item && typeof item === "object") {
					scanForOptionValues(item);
				}
			}
			return;
		}
		for (const [k, v] of Object.entries(obj)) {
			if (k === "options" && Array.isArray(v)) {
				for (const opt of v) {
					if (typeof opt === "string" && opt.trim()) {
						optionValues.add(opt);
					}
				}
			} else if (typeof v === "object" && v !== null) {
				scanForOptionValues(v);
			}
		}
	}

	if (root.collections) scanForOptionValues(root.collections);
	if (root.blockTypes) scanForOptionValues(root.blockTypes);

	if (Array.isArray(root.menus)) {
		for (const menu of root.menus) {
			if (menu && typeof menu === "object" && typeof menu.name === "string" && menu.name.trim()) {
				menuNames.add(menu.name);
			}
		}
	}

	const knownPhrases = getKnownDictionaryPhrases(dictionary);
	for (const key of knownPhrases) {
		if (optionValues.has(key) && !warnedKeys.has(`opt:${key}`)) {
			warnedKeys.add(`opt:${key}`);
			const msg = `[emdash-schema-i18n] dictionary key "${key}" equals a select option value; it will not be applied to options, use a path key for labels`;
			console.warn(msg);
			warnings.push(msg);
		}
		if (menuNames.has(key) && !warnedKeys.has(`menu:${key}`)) {
			warnedKeys.add(`menu:${key}`);
			const msg = `[emdash-schema-i18n] dictionary key "${key}" equals a menu name; it will not be applied to menus, use a path key for labels`;
			console.warn(msg);
			warnings.push(msg);
		}
	}

	return warnings;
}

/**
 * Verifies that every translatable string in `seed` has a non-empty translation
 * in `dictionary` for each locale in `locales`. Throws an Error (with `.missing`)
 * if any translations are missing.
 *
 * @param {any} seed Parsed EmDash seed JSON object.
 * @param {Record<string, Record<string, string>>} dictionary Translation dictionary.
 * @param {string | string[]} [locales=["uk"]] Target locale(s) to verify (e.g. `["uk"]` or `["uk", "de"]`).
 * @returns {{ covered: true, keys: string[], locales: string[] }}
 */
export function assertDictionaryCovers(seed, dictionary, locales = ["uk"]) {
	const targetLocales = (
		Array.isArray(locales)
			? locales
			: typeof locales === "string"
				? locales.split(",")
				: ["uk"]
	)
		.map((l) => String(l).trim())
		.filter(Boolean);

	if (targetLocales.length === 0) {
		targetLocales.push("uk");
	}

	warnOnIdentifierDictionaryKeys(seed, dictionary);

	const knownPhrases =
		dictionary && typeof dictionary === "object"
			? getKnownDictionaryPhrases(dictionary)
			: new Set();
	const { keys } = extractSeedStrings(seed, { knownPhrases });

	/** @type {Record<string, string[]>} */
	const missing = {};
	const lines = [];

	for (const locale of targetLocales) {
		const localeDict =
			dictionary &&
			typeof dictionary === "object" &&
			Object.hasOwn(dictionary, locale) &&
			dictionary[locale] &&
			typeof dictionary[locale] === "object"
				? dictionary[locale]
				: undefined;

		const missingForLocale = [];
		for (const key of keys) {
			const val =
				localeDict && Object.hasOwn(localeDict, key) ? localeDict[key] : undefined;
			if (typeof val !== "string" || val.trim().length === 0) {
				missingForLocale.push(key);
			}
		}

		if (missingForLocale.length > 0) {
			missing[locale] = missingForLocale;
			lines.push(
				`  [${locale}] (${missingForLocale.length} missing): ${missingForLocale.map((k) => JSON.stringify(k)).join(", ")}`,
			);
		}
	}

	if (lines.length > 0) {
		const err = new Error(
			`[emdash-schema-i18n] Missing schema translations in dictionary:\n${lines.join("\n")}`,
		);
		/** @type {any} */ (err).missing = missing;
		throw err;
	}

	return {
		covered: true,
		keys,
		locales: targetLocales,
	};
}



