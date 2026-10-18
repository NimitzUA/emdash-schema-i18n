import { definePlugin } from "emdash";
import {
	createLocalizationMiddleware,
	withSchemaLocalization,
	RELOAD_WATCHER_SCRIPT,
	DEFAULT_MAX_RESTORE_BODY_BYTES,
	isJsonMimeType,
	resolveSessionScope,
	validateMiddlewareOptions,
} from "./middleware.mjs";
import {
	localizeManifest,
	localizeBlockTypesResponse,
	localizeBlockTypeResponse,
	localizeCollectionsResponse,
	localizeTaxonomiesResponse,
	localizeTaxonomyResponse,
	TaxonomyTranslationCache,
	recordTaxonomyTranslations,
	restoreOriginalTaxonomyInput,
	extractSeedStrings,
	warnOnIdentifierDictionaryKeys,
	assertDictionaryCovers,
	localizeString,
	resolveAdminLocale,
	normalizeLocale,
	installLocaleReloadWatcher,
} from "./localizer.mjs";

const pluginId = "schema-i18n";
const pluginName = "Schema & Blocks i18n";
const version = "1.4.1";
const description = "Dynamic schema, collections, and block types localization for EmDash CMS Admin UI";
const author = "Serhii Parshyn";
const packageEntrypoint = "emdash-schema-i18n";
const adminEntrypoint = "emdash-schema-i18n/admin";

/**
 * Native plugin descriptor factory for EmDash.
 *
 * @returns {import("emdash").PluginDescriptor}
 */
export function schemaLocalization() {
	return {
		id: pluginId,
		name: pluginName,
		version,
		description,
		author,
		format: "native",
		capabilities: [],
		entrypoint: packageEntrypoint,
		adminEntry: adminEntrypoint,
	};
}

// Backwards-compatibility and alternative aliases
export const customLocalization = schemaLocalization;
export const schemaI18n = schemaLocalization;

export function createPlugin() {
	return definePlugin({
		id: pluginId,
		version,
		capabilities: [],
		admin: {
			adminEntry: adminEntrypoint,
		},
	});
}

export {
	createLocalizationMiddleware,
	withSchemaLocalization,
	RELOAD_WATCHER_SCRIPT,
	DEFAULT_MAX_RESTORE_BODY_BYTES,
	isJsonMimeType,
	resolveSessionScope,
	validateMiddlewareOptions,
	localizeManifest,
	localizeBlockTypesResponse,
	localizeBlockTypeResponse,
	localizeCollectionsResponse,
	localizeTaxonomiesResponse,
	localizeTaxonomyResponse,
	TaxonomyTranslationCache,
	recordTaxonomyTranslations,
	restoreOriginalTaxonomyInput,
	extractSeedStrings,
	warnOnIdentifierDictionaryKeys,
	assertDictionaryCovers,
	localizeString,
	resolveAdminLocale,
	normalizeLocale,
	installLocaleReloadWatcher,
};

export default schemaLocalization;
