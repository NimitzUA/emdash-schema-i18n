# Changelog

All notable changes to `emdash-schema-i18n` are documented in this file.

## [1.4.1] - 2026-10-19

> **⚠️ Behaviour Fix in `1.4.1`:**
> Select option values and menu names are no longer translated. Dictionaries that relied on translating plain-string options must switch to `{ value, label }` options.

### Fixed
- **Never Translate Identifiers (`options` strings & `menu.name`)**:
  - Plain-string select options (`options: ["cover", "contain"]` and `validation.options: ["public", "private"]`) are now left untouched across manifest fields, block-type fields, repeater/group sub-fields, and `versions[].fields`. Previously, if a dictionary contained a phrase matching a plain-string option value (e.g. `"private": "приватний"`), the admin received and saved the translated value as the stored option value.
  - Object options (`{ value, label }`) continue to localize `label` (via path key `...options.<value>.label`, then phrase lookup) and copy `value` verbatim; objects without `label` are left untouched.
  - `menu.name` (e.g. `"primary"`) is treated as an identifier and is never localized (`menu.label` is localized if present).
- **Updated Coverage Helpers & CLI Extraction**: `extractSeedStrings`, `assertDictionaryCovers`, and `emdash-schema-i18n extract` / `--check` no longer extract or require translations for plain-string options or `menu.name` (they still collect `{ value, label }` option labels and `menu.label`).
- **Safety Net Warning (`warnOnIdentifierDictionaryKeys`)**: `assertDictionaryCovers` and the first manifest processed by `createLocalizationMiddleware` now log a one-time `console.warn` when a dictionary phrase key equals a plain-string option value or a `menu.name` (`dictionary key "<k>" equals a select option value; it will not be applied to options, use a path key for labels`).
- **RFC 6838 Media Type Validation (`isJsonMimeType`)**: Hardened `isJsonMimeType` to validate restricted media-type syntax (`/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/`) before checking `application/json` or `+json`, rejecting malformed headers such as `application/x/+json`, `text/json+evil`, or `application/json, text/html`.

---

## [1.4.0] - 2026-10-18

> **⚠️ Breaking Default Changes in `1.4.0` (Safer Opt-In Defaults):**
> - **`localizeTaxonomies` now defaults to `false`** (previously `true` in `1.3.x`). Pass `localizeTaxonomies: true` to `createLocalizationMiddleware` / `withSchemaLocalization` to localize `/_emdash/api/taxonomies` and `manifest.taxonomies`.
> - **`allowQueryParam` and `useAcceptLanguage` now default to `false`** (previously `true`). By default, admin locale is resolved strictly from the `emdash-locale` cookie (falling back to `defaultLocale`), ensuring UI and schema labels never diverge on first visit. Pass `allowQueryParam: true` or `useAcceptLanguage: true` to re-enable query or header locale resolution.

### Added
- **Multi-Locale CLI Scaffolding (`--locales uk,de`)**: `emdash-schema-i18n extract` now accepts `--locales=uk,de` (or `--locales uk,de`) to scaffold entries for all listed locales simultaneously.
- **CLI CI Verification (`--check`)**: Added `emdash-schema-i18n extract --check` which exits with code `1` and lists any untranslated `seed.json` strings per locale without modifying files.
- **Test Helper (`assertDictionaryCovers(seed, dictionary, locales)`)**: Exported `assertDictionaryCovers` and `extractSeedStrings` from `emdash-schema-i18n` so projects can verify dictionary coverage in unit tests with a single call.
- **Independent `localizeManifestTaxonomies` Option**: Added `localizeManifestTaxonomies` to control `manifest.taxonomies` translation independently (defaults to `localizeTaxonomies`).
- **Startup Option Validation (`validateMiddlewareOptions`)**: `createLocalizationMiddleware` now validates option names and value types at startup and logs `console.warn` messages for unknown keys (e.g. typo `localiseTaxonomies`) or invalid types.
- **Request Body Size Limit (`maxRestoreBodyBytes`)**: Added `maxRestoreBodyBytes` (default `65536` = 64 KiB) to skip `PUT`/`PATCH` taxonomy restoration when `Content-Length` or streamed body bytes exceed the limit.
- **Session/User-Scoped Taxonomy Cache (`resolveSessionScope`)**: Scoped `TaxonomyTranslationCache` keys by `sessionScope + name + locale + field` (using `locals.user.id`, `Authorization` header, or session cookies) so cached translations cannot leak across concurrent editors.
- **Documentation**: Added the EmDash 1.3.0 Admin UI Screen vs Endpoint Safety Matrix and single-process cache notes to `README.md`.

### Fixed
- **Safe Request Body Cancellation Order**: When `restoreTaxonomyLabelsOnWrite: true` replaces `context.request`, `originalRequest.body?.cancel()` is now called **only after** `context.request` has been replaced, keeping the original request intact if anything fails.
- **Strict JSON MIME Parsing (`isJsonMimeType`)**: Middleware now parses the MIME type and only accepts `application/json` and `*+json` instead of matching any header containing `"json"`.
- **Conflict Guard for `?locale=` vs `body.locale`**: Documented fallback to `body.locale` on `PUT`/`PATCH` and skipped restoration whenever both `?locale=` and `body.locale` are present and resolve to different locales.
- **Lazy Cache Instantiation**: `TaxonomyTranslationCache` is no longer instantiated when `restoreTaxonomyLabelsOnWrite` is `false`.

---

## [1.3.1] - 2026-10-18

### Changed
- **Opt-In Request Body Rewriting (`restoreTaxonomyLabelsOnWrite: false`)**: Separated `PUT`/`PATCH /_emdash/api/taxonomies/[name]` request body rewriting (introduced in `1.3.0`) from `localizeTaxonomies` into its own opt-in option `restoreTaxonomyLabelsOnWrite` (default `false`), since EmDash 1.3.0 Admin UI does not send `PUT` updates for taxonomy definitions and mutating incoming request bodies is only needed for external `GET` -> `PUT` scripts.
- **Target-Record Locale & Bounded TTL Cache (`TaxonomyTranslationCache`)**: When `restoreTaxonomyLabelsOnWrite: true` is enabled, restoration now resolves the target definition row's locale from `?locale=` (or `defaultLocale` when omitted, rather than the admin cookie) and only restores a field if the incoming value matches the exact translation previously served by `GET` for `name + locale + field` (stored in a bounded cache with configurable `taxonomyCacheMaxSize: 500` and `taxonomyCacheTtlMs: 300_000`). Removed reverse dictionary scanning so deliberate `PUT ?locale=uk` writes with Ukrainian labels are never overwritten.
- **Removed `Referer`-Based Exclusion**: Dropped `Referer` header sniffing on `GET /_emdash/api/taxonomies...` in favor of explicit endpoint/option configuration (`localizeTaxonomies`).
- **Taxonomy Fields Alignment**: Removed non-existent `description` from taxonomy definition fields (`label` and `labelSingular` only, matching EmDash's `_emdash_taxonomy_defs` schema).

---

## [1.3.0] - 2026-10-18

### Added
- **Taxonomy Definitions API Localization (`localizeTaxonomies: true`)**: Automatically localizes `label` and `labelSingular` on `GET`/`HEAD` requests to `/_emdash/api/taxonomies` and `/_emdash/api/taxonomies/[name]` (supporting exact key overrides like `taxonomies.<name>.label` and `taxonomies.<name>.labelSingular`).
- **Taxonomy Terms Isolation**: Leaves `/_emdash/api/taxonomies/[name]/terms...`, `.../translations`, `.../reorder`, and `.../bulk-tag` untouched so per-locale term content managed by EmDash is never altered.
- **Request Body Rewriting on Taxonomy `PUT`/`PATCH` (New Behavior)**: Introduced request body restoration on `PUT`/`PATCH /_emdash/api/taxonomies/[name]` to prevent translated labels from overwriting canonical taxonomy definitions (refined and made opt-in via `restoreTaxonomyLabelsOnWrite: false` in `1.3.1`).
- **New Public Exports**: Exported `localizeTaxonomiesResponse` and `localizeTaxonomyResponse`.

---

## [1.2.4] - 2026-10-18

### Fixed
- **Safe Error Fallback on Stream Cancellation**: Moved `response.body?.cancel()` to run **after** localization and `new Response(...)` construction so that if localization throws an error, `catch` returns the original uncancelled `response` with its body intact.
- **Precise `Vary` Header**: `Vary` now only includes `Accept-Language` when `useAcceptLanguage` is enabled, only includes `Cookie` when `useCookie` is enabled, and omits both when the locale is determined directly by `?locale=` in the URL.

### Added
- **Cookie Priority & Toggle**: Added `preferCookieOverQuery` (default `false`) and `useCookie` (default `true`) options to `createLocalizationMiddleware` and `resolveAdminLocale`.

---

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
