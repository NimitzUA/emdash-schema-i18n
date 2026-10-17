import { definePlugin } from "emdash";
import pkg from "../package.json" with { type: "json" };
import {
	createLocalizationMiddleware,
	withSchemaLocalization,
	RELOAD_WATCHER_SCRIPT,
} from "./middleware.mjs";
import {
	localizeManifest,
	localizeBlockTypesResponse,
	localizeBlockTypeResponse,
	localizeCollectionsResponse,
	localizeString,
	resolveAdminLocale,
	normalizeLocale,
} from "./localizer.mjs";

const pluginId = "schema-i18n";
const pluginName = "Schema & Blocks i18n";
const version = pkg.version;
const description = "Dynamic schema, collections, and block types localization for EmDash CMS Admin UI";
const author = "Serhii Parshyn";
const packageEntrypoint = "emdash-schema-i18n";
const adminEntrypoint = "emdash-schema-i18n/admin";

/**
 * Native plugin descriptor factory for EmDash.
 *
 * @param {object} [options]
 * @returns {import("emdash").PluginDescriptor}
 */
export function schemaLocalization(options = {}) {
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
		options,
	};
}

// Backwards-compatibility and alternative aliases
export const customLocalization = schemaLocalization;
export const schemaI18n = schemaLocalization;

export function createPlugin(_options = {}) {
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
	localizeManifest,
	localizeBlockTypesResponse,
	localizeBlockTypeResponse,
	localizeCollectionsResponse,
	localizeString,
	resolveAdminLocale,
	normalizeLocale,
};

export default schemaLocalization;
