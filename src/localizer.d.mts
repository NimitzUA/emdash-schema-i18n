export interface LocalizeOptions {
	key?: string;
	dictionary?: Record<string, Record<string, string>>;
	separator?: string;
	splitBilingual?: boolean;
	separatorLocales?: string[];
	defaultLocale?: string;
}

export interface ResolveLocaleOptions {
	useCookie?: boolean;
	useAcceptLanguage?: boolean;
	allowQueryParam?: boolean;
	preferCookieOverQuery?: boolean;
}

export declare function installLocaleReloadWatcher(): void;

export declare function normalizeLocale(
	code: string,
	defaultLocale?: string,
): string;

export declare function resolveAdminLocale(
	request: Request,
	defaultLocale?: string,
	options?: ResolveLocaleOptions,
): string;

export declare function localizeString(
	value: unknown,
	locale: string,
	options?: LocalizeOptions,
): unknown;

export declare function localizeManifest<T = any>(
	manifest: T,
	locale: string,
	options?: LocalizeOptions,
): T;

export declare function localizeBlockTypesResponse<T = any>(
	data: T,
	locale: string,
	options?: LocalizeOptions,
): T;

export declare function localizeBlockTypeResponse<T = any>(
	data: T,
	locale: string,
	options?: LocalizeOptions,
): T;

export declare function localizeCollectionsResponse<T = any>(
	data: T,
	locale: string,
	options?: LocalizeOptions,
): T;

export declare function localizeTaxonomiesResponse<T = any>(
	data: T,
	locale: string,
	options?: LocalizeOptions,
): T;

export declare function localizeTaxonomyResponse<T = any>(
	data: T,
	locale: string,
	options?: LocalizeOptions,
): T;

