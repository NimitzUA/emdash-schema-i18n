# Changelog

All notable changes to `emdash-schema-i18n` are documented in this file.

## [1.2.3] - 2026-10-18

### Fixed
- **HEAD Request Headers**: `HEAD` requests to `/_emdash/api/manifest` and `/_emdash/api/schema/*` now consistently strip `ETag` and `Content-Length` and merge `Vary: Cookie, Accept-Language` just like `GET` requests.
- **Locale Fallback (`normalizeLocale`)**: `normalizeLocale("", defaultLocale)` now respects the configured `defaultLocale` instead of hardcoding `"en"`.
- **Stream Cleanup**: Middleware now explicitly cancels the original `response.body` stream (`response.body?.cancel()`) after consuming `response.clone()` when returning a transformed response.
- **Unused Descriptor Options**: Removed unused `options` parameter from `schemaLocalization()` and `createPlugin()` to prevent translation dictionaries from being passed into `astro.config.mjs` and bundled without effect.
- **Runtime JSON Import**: Replaced runtime `import pkg from "../package.json" with { type: "json" }` in `src/index.mjs` with a static version constant (verified against `package.json` in tests) for broader bundler/Vite compatibility.

### Added
- **Locale Resolution Controls**: Added `useAcceptLanguage` (default `true`) and `allowQueryParam` (default `true`) options to `createLocalizationMiddleware` and `resolveAdminLocale`.
- **Package Metadata & Tarball**: Added upper bounds to `peerDependencies` (`emdash <2.0.0`, `astro <8.0.0`, etc.) and included `CHANGELOG.md` and `test/` in published package files.
- **Expanded Test Suite**: Added unit tests for `HEAD` requests, non-2xx responses (`404`, `500`, `304`), `splitBilingual: false`, custom `separator`, `normalizeLocale` fallback, and `useAcceptLanguage: false`.

---

## [1.2.2] - 2026-10-17

### Fixed
- **CLI Slash Preservation**: Prevented `emdash-schema-i18n extract --clean-seed` from splitting canonical English phrases containing `" / "` (when already present in the dictionary) or strings with 3+ parts.
- **TypeScript Declarations**: Deduplicated `src/index.d.mts` by re-exporting types and functions from `src/localizer.d.mts`.
- **Unified Fields Traversal**: Used `localizeFieldsCollection` consistently across block types, versions, and nested subfields (supporting both arrays and keyed object maps).

### Added
- **Admin UI Unit Tests**: Added `test/admin.test.mjs` covering `useAdminLocale`, `useLocalizedText`, `LocalizedText`, and `installLocaleReloadWatcher`.

---

## [1.2.1] - 2026-10-17

### Fixed
- **Hook Memoization (`useLocalizedText`)**: Destructured option fields in `React.useMemo` dependency array so `<LocalizedText />` does not recompute on every render.
- **`Accept-Language` Quality Weights**: `resolveAdminLocale` now parses and sorts `;q=` quality weights and ignores wildcard `*`, as well as normalizing POSIX underscore locales (`uk_UA` -> `uk`).
- **Non-JSON Response Guard**: Middleware now checks `Content-Type` before attempting `.json()` parsing on schema routes.
- **CLI Validation**: CLI now validates positional commands and flags and sorts keys deterministically across all locales.

### Added
- **Plugin Editor Contributions**: Added localization support for `editorPanels` and `editorActions` in `manifest.plugins`.

---

## [1.2.0] - 2026-10-17

### Added
- **Manifest Coverage**: Added localization for collection `group` folders, `manifest.taxonomies`, and `manifest.plugins` (`adminPages`, `dashboardWidgets`, `fieldWidgets`, `portableTextBlocks`).
- **Multi-Locale CLI (`--locale=<code>`)**: Added `--locale` flag to `emdash-schema-i18n extract` while preserving existing translations for other locales in `admin.ts`.
- **Middleware Subpath Types**: Added `src/middleware.d.mts` for `"emdash-schema-i18n/middleware"`.

### Fixed
- **Prototype Pollution Guard**: Used `Object.hasOwn` across all dictionary and multi-language object lookups.
- **Fast-Path Routing**: Skipped non-`/_emdash/` requests immediately in middleware before inspecting responses.
- **Initial `<html lang>` Watcher**: Prevented `MutationObserver` from triggering an extra reload when `<html lang>` transitions from empty `""` to its initial value on page load.

---

## [1.1.2] - 2026-10-17

### Fixed
- **CI Publishing**: Upgraded npm in GitHub Actions workflow to support staged publishing (`npm stage publish`).

---

## [1.1.1] - 2026-10-17

### Fixed
- **Schema Editor Protection**: Added `excludeSchemaEditor: true` by default so GET requests to `/_emdash/api/schema/collections` are not localized unless `localizeSchemaCollections: true` is passed, preventing Content Types editor saves from overwriting database labels.
- **Single Block Type Endpoint**: Added localization support for `GET /_emdash/api/schema/block-types/<slug>`.
- **HTTP Caching Headers**: Merged `Vary: Cookie, Accept-Language` and removed stale `ETag` and `Content-Length` headers on localized JSON responses.

---

## [1.0.0] - 2026-10-17

### Added
- Initial release of `emdash-schema-i18n` with manifest/block-types localization, React Admin UI hooks (`useAdminLocale`, `useLocalizedText`, `<LocalizedText />`), Astro middleware (`createLocalizationMiddleware`), and CLI (`emdash-schema-i18n extract`).
