export interface LocalizeOptions {
	key?: string;
	dictionary?: Record<string, Record<string, string>>;
	separator?: string;
}

export declare function normalizeLocale(code: string): string;

export declare function resolveAdminLocale(
	request: Request,
	defaultLocale?: string,
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

export declare function localizeCollectionsResponse<T = any>(
	data: T,
	locale: string,
	options?: LocalizeOptions,
): T;
