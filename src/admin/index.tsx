import * as React from "react";
import { useLingui } from "@lingui/react";
import { localizeString } from "../localizer.mjs";

const DEFAULT_SEPARATOR = " / ";

export interface LocalizeTextOptions {
	separator?: string;
	key?: string;
	dictionary?: Record<string, Record<string, string>>;
}

/**
 * Hook to retrieve the active admin UI locale.
 */
export function useAdminLocale(): string {
	try {
		const { i18n } = useLingui();
		return i18n.locale || "en";
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

	return React.useMemo(() => {
		const opts: LocalizeTextOptions =
			typeof options === "string" ? { separator: options } : options;
		return String(localizeString(text, locale, opts) ?? "");
	}, [text, locale, options]);
}

/**
 * Component that renders localized text for the active admin locale.
 */
export function LocalizedText({
	children,
	separator = DEFAULT_SEPARATOR,
	dictionary,
	translationKey,
}: {
	children: string;
	separator?: string;
	dictionary?: Record<string, Record<string, string>>;
	translationKey?: string;
}) {
	const localized = useLocalizedText(children, {
		separator,
		dictionary,
		key: translationKey,
	});
	return <>{localized}</>;
}

// Auto-reload watcher on admin UI locale change
if (
	typeof window !== "undefined" &&
	typeof window.MutationObserver !== "undefined" &&
	!(window as any).__emdash_i18n_lang_watcher__
) {
	(window as any).__emdash_i18n_lang_watcher__ = true;
	let currentLang = document.documentElement.getAttribute("lang") || "";
	const observer = new MutationObserver(() => {
		const newLang = document.documentElement.getAttribute("lang") || "";
		if (newLang && currentLang && newLang !== currentLang) {
			currentLang = newLang;
			setTimeout(() => {
				window.location.reload();
			}, 60);
		}
	});
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["lang"],
	});
}

