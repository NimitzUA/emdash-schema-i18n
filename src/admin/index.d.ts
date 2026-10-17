import * as React from "react";
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
export declare function useAdminLocale(): string;
/**
 * Hook to localize a string, phrase or delimited label using the active admin locale.
 */
export declare function useLocalizedText(text: unknown, options?: LocalizeTextOptions | string): string;
/**
 * Component that renders localized text for the active admin locale.
 */
export declare function LocalizedText({ children, separator, dictionary, translationKey, splitBilingual, separatorLocales, }: {
    children: string;
    separator?: string;
    dictionary?: Record<string, Record<string, string>>;
    translationKey?: string;
    splitBilingual?: boolean;
    separatorLocales?: string[];
}): React.JSX.Element;
