import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
import * as React from "react";
import { useLingui } from "@lingui/react";
import { localizeString, installLocaleReloadWatcher } from "../localizer.mjs";
const DEFAULT_SEPARATOR = " / ";
/**
 * Hook to retrieve the active admin UI locale.
 */
export function useAdminLocale() {
    try {
        const { i18n } = useLingui();
        return i18n.locale || "en";
    }
    catch {
        return "en";
    }
}
/**
 * Hook to localize a string, phrase or delimited label using the active admin locale.
 */
export function useLocalizedText(text, options = DEFAULT_SEPARATOR) {
    const locale = useAdminLocale();
    return React.useMemo(() => {
        const opts = typeof options === "string" ? { separator: options } : options;
        return String(localizeString(text, locale, opts) ?? "");
    }, [text, locale, options]);
}
/**
 * Component that renders localized text for the active admin locale.
 */
export function LocalizedText({ children, separator = DEFAULT_SEPARATOR, dictionary, translationKey, }) {
    const localized = useLocalizedText(children, {
        separator,
        dictionary,
        key: translationKey,
    });
    return _jsx(_Fragment, { children: localized });
}
// Auto-reload watcher on admin UI locale change
installLocaleReloadWatcher();
