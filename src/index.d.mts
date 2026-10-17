import type { PluginDescriptor } from "emdash";

export interface SchemaI18nOptions {
	separator?: string;
	defaultLocale?: string;
	dictionary?: Record<string, Record<string, string>>;
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
): PluginDescriptor;

export declare function createLocalizationMiddleware(
	options?: SchemaI18nOptions,
): (context: any, next: () => Promise<Response>) => Promise<Response>;

export declare function resolveAdminLocale(
	request: Request,
	defaultLocale?: string,
): string;

export declare function normalizeLocale(code: string): string;

export declare function localizeString(
	value: unknown,
	locale: string,
	options?: {
		key?: string;
		dictionary?: Record<string, Record<string, string>>;
		separator?: string;
	},
): unknown;

export declare function localizeManifest<T = any>(
	manifest: T,
	locale: string,
	options?: {
		dictionary?: Record<string, Record<string, string>>;
		separator?: string;
	},
): T;

export declare function localizeBlockTypesResponse<T = any>(
	data: T,
	locale: string,
	options?: {
		dictionary?: Record<string, Record<string, string>>;
		separator?: string;
	},
): T;

export declare function localizeCollectionsResponse<T = any>(
	data: T,
	locale: string,
	options?: {
		dictionary?: Record<string, Record<string, string>>;
		separator?: string;
	},
): T;

export default schemaLocalization;
