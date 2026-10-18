export interface LocalizeOptions {
	key?: string;
	dictionary?: Record<string, Record<string, string>>;
	separator?: string;
	splitBilingual?: boolean;
	separatorLocales?: string[];
	defaultLocale?: string;
	localizeTaxonomies?: boolean;
	localizeManifestTaxonomies?: boolean;
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

export declare class TaxonomyTranslationCache {
	maxSize: number;
	ttlMs: number;
	constructor(options?: {
		maxSize?: number;
		ttlMs?: number;
		now?: () => number;
	});
	makeKey(
		name: string,
		locale: string,
		field: string,
		sessionScope?: string,
	): string;
	pruneExpired(currentTime?: number): void;
	set(
		name: string,
		locale: string,
		field: string,
		served: string,
		original: string,
		sessionScope?: string,
	): void;
	getOriginal(
		name: string,
		locale: string,
		field: string,
		incomingValue: string,
		sessionScope?: string,
	): string | undefined;
	delete(
		name: string,
		locale: string,
		field: string,
		sessionScope?: string,
	): void;
	readonly size: number;
}

export declare function recordTaxonomyTranslations(
	rawData: any,
	localizedData: any,
	fallbackRowLocale: string | undefined,
	defaultLocale: string,
	cache: TaxonomyTranslationCache,
	sessionScope?: string,
): void;

export declare function restoreOriginalTaxonomyInput<T = any>(
	input: T,
	taxonomyName: string,
	targetLocale: string,
	options?: LocalizeOptions,
	cache?: TaxonomyTranslationCache,
	sessionScope?: string,
): { body: T; changed: boolean };

export declare function extractSeedStrings(
	seed: any,
	options?: {
		cleanSeed?: boolean;
		knownPhrases?: Set<string>;
	},
): {
	keys: string[];
	inlineTranslations: Map<string, string>;
};

export declare function assertDictionaryCovers(
	seed: any,
	dictionary: Record<string, Record<string, string>>,
	locales?: string[] | string,
): {
	covered: true;
	keys: string[];
	locales: string[];
};
