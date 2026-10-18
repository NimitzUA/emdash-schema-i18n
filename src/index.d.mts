import type { definePlugin, PluginDescriptor } from "emdash";
import type { LocalizeOptions, ResolveLocaleOptions } from "./localizer.mjs";

export type { LocalizeOptions, ResolveLocaleOptions } from "./localizer.mjs";
export {
	installLocaleReloadWatcher,
	normalizeLocale,
	resolveAdminLocale,
	localizeString,
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
} from "./localizer.mjs";

export interface SchemaI18nOptions
	extends Omit<LocalizeOptions, "key">,
		ResolveLocaleOptions {
	excludeSchemaEditor?: boolean;
	localizeSchemaCollections?: boolean;
	localizeTaxonomies?: boolean;
	localizeManifestTaxonomies?: boolean;
	restoreTaxonomyLabelsOnWrite?: boolean;
	maxRestoreBodyBytes?: number;
	taxonomyCacheMaxSize?: number;
	taxonomyCacheTtlMs?: number;
	injectHtmlWatcher?: boolean;
	autoReloadOnLocaleChange?: boolean;
	now?: () => number;
}

export type CustomLocalizationOptions = SchemaI18nOptions;

export declare const RELOAD_WATCHER_SCRIPT: string;
export declare const DEFAULT_MAX_RESTORE_BODY_BYTES: number;

export declare function isJsonMimeType(
	contentType: string | null | undefined,
): boolean;

export declare function resolveSessionScope(context: any): string;

export declare function validateMiddlewareOptions(
	options: unknown,
): string[];

export declare function schemaLocalization(): PluginDescriptor;

export declare const customLocalization: typeof schemaLocalization;
export declare const schemaI18n: typeof schemaLocalization;

export declare function createPlugin(): ReturnType<typeof definePlugin>;

export declare function createLocalizationMiddleware(
	options?: SchemaI18nOptions,
): (context: any, next: () => Promise<Response>) => Promise<Response>;

export declare function withSchemaLocalization(
	existingOnRequest?: (context: any, next: () => Promise<Response>) => Promise<Response>,
	options?: SchemaI18nOptions,
): (context: any, next: () => Promise<Response>) => Promise<Response>;

export default schemaLocalization;
