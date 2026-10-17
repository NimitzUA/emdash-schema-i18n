/**
 * String and Manifest localization engine for EmDash.
 */

const DEFAULT_SEPARATOR = " / ";

/**
 * Resolves the admin UI locale from an incoming HTTP Request.
 *
 * Precedence:
 * 1. Query parameter `locale`
 * 2. Cookie `emdash-locale` (standard EmDash admin locale cookie)
 * 3. Header `Accept-Language`
 * 4. Fallback default (`en`)
 *
 * @param {Request} request
 * @param {string} [defaultLocale="en"]
 * @returns {string}
 */
export function resolveAdminLocale(request, defaultLocale = "en") {
	if (!request) return defaultLocale;

	try {
		const url = new URL(request.url);
		const queryLocale = url.searchParams.get("locale")?.trim();
		if (queryLocale) return normalizeLocale(queryLocale);
	} catch {
		// Ignore invalid URLs
	}

	const cookieHeader = request.headers.get("cookie") || "";
	const cookieMatch = cookieHeader.match(/(?:^|;\s*)emdash-locale=([^;]+)/);
	if (cookieMatch?.[1]) {
		try {
			return normalizeLocale(decodeURIComponent(cookieMatch[1].trim()));
		} catch {
			return normalizeLocale(cookieMatch[1].trim());
		}
	}

	const acceptLanguage = request.headers.get("accept-language");
	if (acceptLanguage) {
		const firstLang = acceptLanguage.split(",")[0]?.split(";")[0]?.trim();
		if (firstLang) return normalizeLocale(firstLang);
	}

	return defaultLocale;
}

/**
 * Normalizes locale code to base language (e.g. "uk-UA" -> "uk", "en-US" -> "en").
 *
 * @param {string} code
 * @returns {string}
 */
export function normalizeLocale(code) {
	if (!code) return "en";
	return code.toLowerCase().split("-")[0] || code.toLowerCase();
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
 * @returns {unknown}
 */
export function localizeString(value, locale, options = {}) {
	const currentLocale = normalizeLocale(locale);
	const {
		key,
		dictionary,
		separator = DEFAULT_SEPARATOR,
		splitBilingual = true,
		separatorLocales = ["uk", "en"],
	} = options;

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

	// If the string is registered as a source phrase in any locale dictionary
	// (e.g. dictionary.uk["Before / after"]), treat it as a canonical phrase rather
	// than a bilingual "uk / en" string when rendering untranslated/default locales.
	const isKnownDictionaryPhrase =
		dictionary &&
		typeof dictionary === "object" &&
		Object.values(dictionary).some(
			(dict) => dict && typeof dict === "object" && Object.hasOwn(dict, value),
		);

	// 4. Delimited string: "Українська / English"
	if (!isKnownDictionaryPhrase && splitBilingual && separator && value.includes(separator)) {
		const parts = value.split(separator);
		// Only split if exactly 2 parts and 2 locales configured
		if (parts.length === 2 && Array.isArray(separatorLocales) && separatorLocales.length === 2) {
			const [firstLocale, secondLocale] = separatorLocales.map((loc) => normalizeLocale(loc));
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
 * Recursively localizes EmDash Manifest collections, fields, and block types.
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

	// Shallow clone top-level
	const localized = { ...manifest };

	// 1. Localize Collections
	if (localized.collections && typeof localized.collections === "object") {
		const newCollections = {};
		for (const [colSlug, colDef] of Object.entries(localized.collections)) {
			if (!colDef || typeof colDef !== "object") {
				newCollections[colSlug] = colDef;
				continue;
			}

			const col = { ...colDef };
			col.label = localizeString(col.label, locale, {
				...options,
				key: `collections.${colSlug}.label`,
			});
			if (col.labelSingular) {
				col.labelSingular = localizeString(col.labelSingular, locale, {
					...options,
					key: `collections.${colSlug}.labelSingular`,
				});
			}
			if (col.description) {
				col.description = localizeString(col.description, locale, {
					...options,
					key: `collections.${colSlug}.description`,
				});
			}

			// Localize collection fields
			if (col.fields && typeof col.fields === "object" && !Array.isArray(col.fields)) {
				const newFields = {};
				for (const [fSlug, fieldDef] of Object.entries(col.fields)) {
					if (!fieldDef || typeof fieldDef !== "object") {
						newFields[fSlug] = fieldDef;
						continue;
					}
					newFields[fSlug] = localizeSingleField(fieldDef, `collections.${colSlug}`, locale, options);
				}
				col.fields = newFields;
			} else if (Array.isArray(col.fields)) {
				col.fields = col.fields.map((fld) => localizeSingleField(fld, `collections.${colSlug}`, locale, options));
			}

			newCollections[colSlug] = col;
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

	return localized;
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
	if (!data || typeof data !== "object") return data;

	if (data.data && typeof data.data === "object" && !Array.isArray(data.data)) {
		return {
			...data,
			data: localizeBlockTypesResponse(data.data, locale, options),
		};
	}

	if (Array.isArray(data.items)) {
		return {
			...data,
			items: data.items.map((bt) => localizeSingleBlockType(bt, locale, options)),
		};
	}

	if (Array.isArray(data)) {
		return data.map((bt) => localizeSingleBlockType(bt, locale, options));
	}

	// Single item envelope: { item: blockType }
	if (data.item && typeof data.item === "object" && !Array.isArray(data.item)) {
		return {
			...data,
			item: localizeSingleBlockType(data.item, locale, options),
		};
	}

	// Single block type object: { slug: "...", label: "..." }
	if (data.slug || data.type || data.name) {
		return localizeSingleBlockType(data, locale, options);
	}

	return data;
}

/**
 * Localizes a single block type response (GET /_emdash/api/schema/block-types/[slug]).
 */
export const localizeBlockTypeResponse = localizeBlockTypesResponse;

function localizeSingleBlockType(bt, locale, options = {}) {
	if (!bt || typeof bt !== "object") return bt;
	const block = { ...bt };
	const btSlug = block.slug || block.type || block.name || "unknown";

	block.label = localizeString(block.label, locale, {
		...options,
		key: `blockTypes.${btSlug}.label`,
	});
	if (block.description) {
		block.description = localizeString(block.description, locale, {
			...options,
			key: `blockTypes.${btSlug}.description`,
		});
	}
	if (block.category) {
		block.category = localizeString(block.category, locale, {
			...options,
			key: `blockTypes.${btSlug}.category`,
		});
	}

	if (Array.isArray(block.fields)) {
		block.fields = block.fields.map((fld) => localizeSingleField(fld, `blockTypes.${btSlug}`, locale, options));
	}

	if (Array.isArray(block.versions)) {
		block.versions = block.versions.map((ver) => {
			if (!ver || !Array.isArray(ver.fields)) return ver;
			return {
				...ver,
				fields: ver.fields.map((fld) => localizeSingleField(fld, `blockTypes.${btSlug}`, locale, options)),
			};
		});
	}

	return block;
}

function localizeSingleField(fld, parentKey, locale, options = {}) {
	if (!fld || typeof fld !== "object") return fld;
	const field = { ...fld };
	const fSlug = field.slug || "unknown";

	if (field.label) {
		field.label = localizeString(field.label, locale, {
			...options,
			key: `${parentKey}.fields.${fSlug}.label`,
		});
	}
	if (field.labelSingular) {
		field.labelSingular = localizeString(field.labelSingular, locale, {
			...options,
			key: `${parentKey}.fields.${fSlug}.labelSingular`,
		});
	}
	if (field.description) {
		field.description = localizeString(field.description, locale, {
			...options,
			key: `${parentKey}.fields.${fSlug}.description`,
		});
	}
	if (field.placeholder) {
		field.placeholder = localizeString(field.placeholder, locale, {
			...options,
			key: `${parentKey}.fields.${fSlug}.placeholder`,
		});
	}
	if (field.hint) {
		field.hint = localizeString(field.hint, locale, {
			...options,
			key: `${parentKey}.fields.${fSlug}.hint`,
		});
	}

	// Options for select / multiSelect
	if (Array.isArray(field.options)) {
		field.options = field.options.map((opt, idx) => {
			if (typeof opt === "string") {
				return localizeString(opt, locale, {
					...options,
					key: `${parentKey}.fields.${fSlug}.options.${idx}`,
				});
			}
			if (opt && typeof opt === "object") {
				return {
					...opt,
					label: opt.label
						? localizeString(opt.label, locale, {
								...options,
								key: `${parentKey}.fields.${fSlug}.options.${opt.value || idx}.label`,
						  })
						: opt.label,
				};
			}
			return opt;
		});
	}

	if (field.validation && Array.isArray(field.validation.options)) {
		field.validation = {
			...field.validation,
			options: field.validation.options.map((opt, idx) => {
				if (typeof opt === "string") {
					return localizeString(opt, locale, {
						...options,
						key: `${parentKey}.fields.${fSlug}.options.${idx}`,
					});
				}
				if (opt && typeof opt === "object" && opt.label) {
					return {
						...opt,
						label: localizeString(opt.label, locale, {
							...options,
							key: `${parentKey}.fields.${fSlug}.options.${opt.value || idx}.label`,
						}),
					};
				}
				return opt;
			}),
		};
	}

	// Subfields (repeaters, groups)
	if (Array.isArray(field.fields)) {
		field.fields = field.fields.map((sub) => localizeSingleField(sub, `${parentKey}.fields.${fSlug}`, locale, options));
	}
	if (field.validation && Array.isArray(field.validation.subFields)) {
		field.validation = {
			...field.validation,
			subFields: field.validation.subFields.map((sub) =>
				localizeSingleField(sub, `${parentKey}.fields.${fSlug}`, locale, options),
			),
		};
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
	if (!data || typeof data !== "object") return data;

	if (data.data && typeof data.data === "object" && !Array.isArray(data.data)) {
		return {
			...data,
			data: localizeCollectionsResponse(data.data, locale, options),
		};
	}

	if (Array.isArray(data.items)) {
		return {
			...data,
			items: data.items.map((col) => localizeSingleCollection(col, locale, options)),
		};
	}

	if (Array.isArray(data)) {
		return data.map((col) => localizeSingleCollection(col, locale, options));
	}

	// Single item envelope: { item: collection }
	if (data.item && typeof data.item === "object" && !Array.isArray(data.item)) {
		return {
			...data,
			item: localizeSingleCollection(data.item, locale, options),
		};
	}

	if (data.slug || data.label) {
		return localizeSingleCollection(data, locale, options);
	}

	return data;
}

function localizeSingleCollection(col, locale, options = {}) {
	if (!col || typeof col !== "object") return col;
	const c = { ...col };
	const cSlug = c.slug || "unknown";

	c.label = localizeString(c.label, locale, {
		...options,
		key: `collections.${cSlug}.label`,
	});
	if (c.labelSingular) {
		c.labelSingular = localizeString(c.labelSingular, locale, {
			...options,
			key: `collections.${cSlug}.labelSingular`,
		});
	}
	if (c.description) {
		c.description = localizeString(c.description, locale, {
			...options,
			key: `collections.${cSlug}.description`,
		});
	}

	if (c.fields && typeof c.fields === "object" && !Array.isArray(c.fields)) {
		const newFields = {};
		for (const [fSlug, fDef] of Object.entries(c.fields)) {
			newFields[fSlug] = localizeSingleField(fDef, `collections.${cSlug}`, locale, options);
		}
		c.fields = newFields;
	} else if (Array.isArray(c.fields)) {
		c.fields = c.fields.map((fld) => localizeSingleField(fld, `collections.${cSlug}`, locale, options));
	}

	return c;
}
