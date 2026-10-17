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

/**
 * Resolves the admin UI locale from an incoming HTTP Request.
 *
 * Precedence:
 * 1. Query parameter `locale` (unless `options.allowQueryParam === false`)
 * 2. Cookie `emdash-locale` (standard EmDash admin locale cookie)
 * 3. Header `Accept-Language` (unless `options.useAcceptLanguage === false`)
 * 4. Fallback `defaultLocale` (default `"en"`)
 *
 * @param {Request} request
 * @param {string} [defaultLocale="en"]
 * @param {object} [options]
 * @param {boolean} [options.useAcceptLanguage=true]
 * @param {boolean} [options.allowQueryParam=true]
 * @returns {string}
 */
export function resolveAdminLocale(request, defaultLocale = "en", options = {}) {
	const fallback = normalizeLocale(defaultLocale, "en");
	if (!request) return fallback;

	const { useAcceptLanguage = true, allowQueryParam = true } = options;

	if (allowQueryParam) {
		try {
			const url = new URL(request.url);
			const queryLocale = url.searchParams.get("locale")?.trim();
			if (queryLocale) return normalizeLocale(queryLocale, fallback);
		} catch {
			// Ignore invalid URLs
		}
	}

	const cookieHeader = request.headers.get("cookie") || "";
	const cookieMatch = cookieHeader.match(/(?:^|;\s*)emdash-locale=([^;]+)/);
	if (cookieMatch?.[1]) {
		try {
			return normalizeLocale(decodeURIComponent(cookieMatch[1].trim()), fallback);
		} catch {
			return normalizeLocale(cookieMatch[1].trim(), fallback);
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
 * Localizes an array of select/multiSelect options (strings or `{ value, label }` objects).
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
			return localizeString(opt, locale, {
				...options,
				key: `${keyPrefix}.${idx}`,
			});
		}
		if (opt && typeof opt === "object" && opt.label) {
			return {
				...opt,
				label: localizeString(opt.label, locale, {
					...options,
					key: `${keyPrefix}.${opt.value || idx}.label`,
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

	// 3. Localize Menus
	if (Array.isArray(localized.menus)) {
		localized.menus = localized.menus.map((menu) => {
			if (!menu || typeof menu !== "object") return menu;
			const m = { ...menu };
			m.name = localizeString(m.name, locale, {
				...options,
				key: `menus.${m.slug || m.id}.name`,
			});
			return m;
		});
	}

	// 4. Localize Taxonomies
	if (Array.isArray(localized.taxonomies)) {
		localized.taxonomies = localized.taxonomies.map((tax) => {
			if (!tax || typeof tax !== "object") return tax;
			const t = { ...tax };
			const taxSlug = t.name || t.slug || t.id || "unknown";
			localizeObjectProps(t, TAXONOMY_TEXT_PROPS, `taxonomies.${taxSlug}`, locale, options);
			return t;
		});
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

	if (Array.isArray(data)) {
		return data.map(localizeItem);
	}

	if (data.item && typeof data.item === "object" && !Array.isArray(data.item)) {
		return {
			...data,
			item: localizeItem(data.item),
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
