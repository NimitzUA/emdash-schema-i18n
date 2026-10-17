import type { definePlugin, PluginDescriptor } from "emdash";
import type { LocalizeOptions } from "./localizer.mjs";

export type { LocalizeOptions } from "./localizer.mjs";
export {
	installLocaleReloadWatcher,
	normalizeLocale,
	resolveAdminLocale,
	localizeString,
	localizeManifest,
	localizeBlockTypesResponse,
	localizeBlockTypeResponse,
	localizeCollectionsResponse,
} from "./localizer.mjs";

export interface SchemaI18nOptions extends Omit<LocalizeOptions, "key"> {
	defaultLocale?: string;
	excludeSchemaEditor?: boolean;
	localizeSchemaCollections?: boolean;
	injectHtmlWatcher?: boolean;
	autoReloadOnLocaleChange?: boolean;
}

export type CustomLocalizationOptions = SchemaI18nOptions;

export declare const RELOAD_WATCHER_SCRIPT: string;

export declare function schemaLocalization(
	options?: SchemaI18nOptions,
): PluginDescriptor;

export declare const customLocalization: typeof schemaLocalization;
export declare const schemaI18n: typeof schemaLocalization;

export declare function createPlugin(
	options?: SchemaI18nOptions,
): ReturnType<typeof definePlugin>;

export declare function createLocalizationMiddleware(
	options?: SchemaI18nOptions,
): (context: any, next: () => Promise<Response>) => Promise<Response>;

export declare function withSchemaLocalization(
	existingOnRequest?: (context: any, next: () => Promise<Response>) => Promise<Response>,
	options?: SchemaI18nOptions,
): (context: any, next: () => Promise<Response>) => Promise<Response>;

export default schemaLocalization;
