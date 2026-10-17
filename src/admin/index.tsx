import * as React from "react";
import { useLingui } from "@lingui/react";
import {
	localizeString,
	normalizeLocale,
	installLocaleReloadWatcher,
} from "../localizer.mjs";

const DEFAULT_SEPARATOR = " / ";

export interface LocalizeTextOptions {
	separator?: string;
	key?: string;
	dictionary?: Record<string, Record<string, string>>;
	splitBilingual?: boolean;
	separatorLocales?: string[];
}

/**
 * Hook to retrieve the active admin UI locale.
 */
export function useAdminLocale(): string {
	try {
		const { i18n } = useLingui();
		return normalizeLocale(i18n.locale || "en");
	} catch {
		return "en";
	}
}

/**
 * Hook to localize a string, phrase or delimited label using the active admin locale.
 */
export function useLocalizedText(
	text: unknown,
	options: LocalizeTextOptions | string = DEFAULT_SEPARATOR,
): string {
	const locale = useAdminLocale();
	const opts: LocalizeTextOptions =
		typeof options === "string" ? { separator: options } : options;
	const {
		separator,
		key,
		dictionary,
		splitBilingual,
		separatorLocales,
	} = opts;

	return React.useMemo(() => {
		return String(
			localizeString(text, locale, {
				separator,
				key,
				dictionary,
				splitBilingual,
				separatorLocales,
			}) ?? "",
		);
	}, [text, locale, separator, key, dictionary, splitBilingual, separatorLocales]);
}

/**
 * Component that renders localized text for the active admin locale.
 */
export function LocalizedText({
	children,
	separator = DEFAULT_SEPARATOR,
	dictionary,
	translationKey,
	splitBilingual,
	separatorLocales,
}: {
	children: string;
	separator?: string;
	dictionary?: Record<string, Record<string, string>>;
	translationKey?: string;
	splitBilingual?: boolean;
	separatorLocales?: string[];
}) {
	const localized = useLocalizedText(children, {
		separator,
		dictionary,
		key: translationKey,
		splitBilingual,
		separatorLocales,
	});
	return <>{localized}</>;
}

// Auto-reload watcher on admin UI locale change
installLocaleReloadWatcher();
