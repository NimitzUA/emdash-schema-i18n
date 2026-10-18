# emdash-schema-i18n

> Dynamic schema, collections, and block types localization for **EmDash CMS** Admin UI.

[![npm version](https://img.shields.io/npm/v/emdash-schema-i18n.svg)](https://www.npmjs.com/package/emdash-schema-i18n)
[![npm downloads](https://img.shields.io/npm/dm/emdash-schema-i18n.svg)](https://www.npmjs.com/package/emdash-schema-i18n)
[![license](https://img.shields.io/npm/l/emdash-schema-i18n.svg)](LICENSE)

**Author:** Serhii Parshyn (<serhii@parshyn.com>)

---

## Overview

In EmDash CMS, metadata for collections, fields, and block types (`label`, `labelSingular`, `description`, `category`) are stored statically in the database schema. When building multilingual admin sites, developers previously had to combine languages with slashes (e.g. `"Кейси / Case studies"` or `"Заголовок / Title"`), which cluttered the interface.

`emdash-schema-i18n` solves this seamlessly by dynamically localizing schema metadata based on the administrator's active session language (`emdash-locale` cookie).

---

## Features

- **Direct English-first schema:** Keep all your database models and `seed.json` schemas in clean English without slashes.
- **Dictionary phrase lookup:** Easily map English phrases to any target language (`"Case studies": "Кейси"`, `"Chapter": "Розділ"`).
- **Exact path overrides:** Override specific fields when needed (e.g. `collections.case_study.fields.title.label`).
- **Comprehensive coverage:** Localizes collections (including sidebar `group` folders), singular labels, field inputs, dropdown options, taxonomies (opt-in), menus, plugin UI contributions, and block types with all their nested version fields.
- **Multi-Locale Scaffolding & CI Verification:** Scans schemas and block types to scaffold untranslated strings via CLI (`--locales=uk,de`) and verifies dictionary completeness in CI (`--check` or `assertDictionaryCovers`).
- **Startup Option Validation:** Warns at startup if unknown or mistyped option keys (e.g. `localiseTaxonomies`) or invalid types are passed to `createLocalizationMiddleware`.
- **Zero-config slash fallback:** Still supports automatic splitting of legacy bilingual strings (`"Українська / English"`).

---

## Compatibility & Requirements

| Component | Supported Version | Notes |
| :--- | :--- | :--- |
| **EmDash CMS (`emdash`)** | `>= 1.0.1 < 2.0.0` | Tested up to `1.3.0+` |
| **EmDash Admin (`@emdash-cms/admin`)** | `>= 1.2.0 < 2.0.0` | Required for admin UI |
| **Astro** | `>= 6.0.0 < 8.0.0` | Supports Astro 6 and Astro 7 |
| **Node.js** | `>= 22.16` | Required by EmDash runtime |
| **React / React DOM** | `>= 18.0.0 < 20.0.0` | Fully supports React 18 & 19 |
| **Lingui (`@lingui/react`)** | `>= 4.0.0 < 6.0.0` | Used for active admin UI locale detection |

---

## Installation

Install the package from npm using your package manager of choice:

```bash
# npm
npm install emdash-schema-i18n

# pnpm
pnpm add emdash-schema-i18n

# yarn
yarn add emdash-schema-i18n

# bun
bun add emdash-schema-i18n
```

---

## Setup & Architecture

`emdash-schema-i18n` operates on two layers:
1. **Admin UI (`schemaLocalization()` in `astro.config.mjs`)**: Loads the client-side admin bundle (`adminEntry`) which watches language switching via `MutationObserver` and provides `<LocalizedText />` components without inline script CSP issues.
2. **Server Middleware (`withSchemaLocalization` or `createLocalizationMiddleware`)**: Intercepts `/_emdash/api/manifest`, `/_emdash/api/schema/block-types`, and (when opted in) `/_emdash/api/taxonomies` to dynamically translate labels according to the active administrator's language.

### 1. In `astro.config.mjs`

```javascript
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { schemaLocalization } from "emdash-schema-i18n";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [
        schemaLocalization(),
      ],
    }),
  ],
});
```

> **Note:** `schemaLocalization()` registers the plugin descriptor and client `adminEntry`. All translation options (`dictionary`, `defaultLocale`, `localizeTaxonomies`, etc.) are configured in your server middleware (`src/middleware.mjs` / `src/middleware.ts`).

### 2. In Middleware (`src/middleware.mjs`)

#### Option A: Standalone Middleware
If you don't have other middleware:

```javascript
import { createLocalizationMiddleware } from "emdash-schema-i18n/middleware";
import { adminDictionary } from "./i18n/admin.ts";

export const onRequest = createLocalizationMiddleware({
  dictionary: adminDictionary,
  defaultLocale: "en",
  localizeTaxonomies: true, // Optional: localize taxonomy definitions
});
```

#### Option B: Composing With Existing Middleware (e.g. Private Access Auth)
If you already have an existing `onRequest` handler, wrap it using `withSchemaLocalization`:

```javascript
import { withSchemaLocalization } from "emdash-schema-i18n";
import { adminDictionary } from "./i18n/admin.ts";

// Your existing middleware (e.g. auth check, IP allowlist, headers)
async function existingOnRequest(context, next) {
  // perform custom logic...
  return next();
}

export const onRequest = withSchemaLocalization(existingOnRequest, {
  dictionary: adminDictionary,
  defaultLocale: "en",
  localizeTaxonomies: true,
});
```

### 3. Translation Dictionary (`src/i18n/admin.ts`)

```typescript
export const adminDictionary = {
  uk: {
    "Case studies": "Кейси",
    "Case study": "Кейс",
    "Disclaimer": "Дисклеймер",
    "Chapter": "Розділ",
    "Before and after": "До/після",
    "Title (H1 and card)": "Заголовок (H1 і картка)",
    "Visibility": "Видимість",
  },
};

export default adminDictionary;
```

---

## Locale Detection Precedence

By default (`useCookie: true`, `allowQueryParam: false`, `useAcceptLanguage: false`), `resolveAdminLocale` determines the active admin language strictly from the **`emdash-locale` cookie** set by EmDash Admin UI (Lingui), falling back to `defaultLocale` (`"en"`). This guarantees that localized schema labels always match the active Lingui interface language.

When optional flags are enabled, resolution follows this order:

1. **Query Parameter (`?locale=<code>`)**: Disabled by default (`allowQueryParam: false`). When enabled (`allowQueryParam: true`), takes priority over the cookie unless `preferCookieOverQuery: true` is also set.
2. **Cookie (`emdash-locale`)**: Enabled by default (`useCookie: true`). Standard cookie set by EmDash Admin UI when an administrator switches the interface language.
3. **`Accept-Language` Header**: Disabled by default (`useAcceptLanguage: false`). When enabled (`useAcceptLanguage: true`), parses quality weights (`;q=`) and selects the highest-priority language if no cookie matched.
4. **Fallback (`defaultLocale`)**: Defaults to `"en"`.

---

## Translation Resolution Order

For any given label or schema property, `emdash-schema-i18n` resolves translations in the following order:

1. **Exact Key-Path Override**: Direct match in `dictionary[locale][key]` (e.g. `collections.case_study.fields.title.label`).
2. **Phrase Dictionary Lookup**: Direct match in `dictionary[locale][value]` (e.g. `"Case studies" -> "Кейси"`).
3. **Explicit Multi-language Object**: Objects formatted as `{ uk: "...", en: "..." }`.
4. **Bilingual Slash String Fallback**: Strings formatted as `"Українська / English"` (split only when there are exactly two parts and active locale matches `separatorLocales`, default `["uk", "en"]`).

> **Note on English (`en`)**: If the active locale is `en`, English schema definitions are displayed in their original form. English phrases in the dictionary are not searched as source values; to override English labels, use exact key-path overrides (e.g. `dictionary.en["collections.case_study.label"]`).

---

## EmDash 1.3.0 Admin UI Endpoints & Data Safety

The primary security invariant of `emdash-schema-i18n` is that **translating a `GET` response must never cause the Admin UI to write translated schema labels back into canonical English database definitions**.

### EmDash 1.3.0 Endpoint Safety Matrix

| Admin UI Screen | Reads Endpoint (`GET`) | Writes Schema Labels Back? | Middleware Default & Rationale |
| :--- | :--- | :--- | :--- |
| **Admin Sidebar, Navigation & Collection Lists** | `GET /_emdash/api/manifest` | **No** (read-only manifest) | **Localized by default** (`collections`, `blockTypes`, `menus`, `plugins`). `manifest.taxonomies` follows `localizeManifestTaxonomies` (or `localizeTaxonomies`). |
| **Content Item Editor (Fields & PortableText / Blocks)** | `GET /_emdash/api/manifest`<br>`GET /_emdash/api/schema/block-types` | **No** (saves content rows to `/_emdash/api/content/...`, never schema labels) | **Localized by default** so editors see translated field labels, hints, options, and block picker names. |
| **Block Types Manager** (`/_emdash/admin/block-types`) | `GET /_emdash/api/schema/block-types`<br>`GET /_emdash/api/schema/block-types/[slug]` | **Only when user edits & submits block definition form** (`PUT /_emdash/api/schema/block-types/[slug]`) | **Localized on `GET` by default** (required by Content Editor block picker). Avoid saving block definitions from a non-default UI locale or use external seed sync. |
| **Content Types / Schema Editor** (`/_emdash/admin/schema`) | `GET /_emdash/api/schema/collections`<br>`GET /_emdash/api/schema/collections/[slug]` | **Yes** (`PUT`/`PATCH /_emdash/api/schema/collections/[slug]` writes form `label`/`description` back to DB) | **NOT localized by default** (`excludeSchemaEditor: true`, `localizeSchemaCollections: false`) so saving a collection in Schema Editor never overwrites DB schema with translations. |
| **Taxonomy Selector (in Content Editor) & Taxonomies Admin** (`/_emdash/admin/taxonomies`) | `GET /_emdash/api/taxonomies`<br>`GET /_emdash/api/taxonomies/[name]` | **No in Admin UI 1.3.0** (Admin UI only creates via `POST /_emdash/api/taxonomies` and manages terms; it has no `PUT` definition edit form). External scripts may call `PUT /_emdash/api/taxonomies/[name]`. | **Opt-in** (`localizeTaxonomies: false` by default). Enable `localizeTaxonomies: true` to translate taxonomy definition labels; enable `restoreTaxonomyLabelsOnWrite: true` if external scripts round-trip `GET` -> `PUT`. |
| **Taxonomy Terms Manager** | `GET /_emdash/api/taxonomies/[name]/terms...`<br>`.../translations` | **Writes term content** (per-locale content rows in EmDash) | **Never touched** (excluded by path filter). Terms are content with native per-locale rows in EmDash. |

### Taxonomy Options & Write Safeguard (`restoreTaxonomyLabelsOnWrite`)

- **`localizeTaxonomies` (default `false`)**: Opt-in localization for `GET`/`HEAD /_emdash/api/taxonomies` and `/_emdash/api/taxonomies/[name]`. Translates `label` and `labelSingular` (supporting exact overrides `taxonomies.<name>.label` and `taxonomies.<name>.labelSingular`).
- **`localizeManifestTaxonomies` (defaults to `localizeTaxonomies`)**: Controls whether `manifest.taxonomies` inside `GET /_emdash/api/manifest` is localized. Can be set independently (e.g. `localizeManifestTaxonomies: true` while `localizeTaxonomies: false`).
- **`restoreTaxonomyLabelsOnWrite` (default `false`)**: Opt-in request body safeguard for `PUT`/`PATCH /_emdash/api/taxonomies/[name]`:
  - **Session-Scoped Bounded TTL Cache**: When enabled, `GET` responses record `{ served -> original }` mappings in an in-memory `TaxonomyTranslationCache` (`taxonomyCacheMaxSize: 500`, `taxonomyCacheTtlMs: 300_000`) keyed by `sessionScope + name + locale + field` (where `sessionScope` is resolved from `locals.user.id`, `Authorization` header, or the EmDash/Astro session cookie).
  - **Single-Process Limitation**: Because `TaxonomyTranslationCache` is stored in process memory, in multi-instance / serverless deployments `GET` and `PUT` must hit the same Node.js process for cache restoration to apply.
  - **Target Record Locale Resolution**: On `PUT`/`PATCH`, the target record's locale is resolved from `?locale=`, falling back to `body.locale`, and then `defaultLocale` (never the admin UI cookie). If both `?locale=` and `body.locale` are present and conflict, restoration is skipped.
  - **Strict MIME & Body Size Guards**: Only inspects requests with `Content-Type: application/json` or `*+json` whose body size does not exceed `maxRestoreBodyBytes` (default `65536` bytes = 64 KiB, enforced on both `Content-Length` and streamed chunks).
  - **Safe Stream Replacement**: Constructs and assigns the new `Request` to `context.request` **before** cancelling the original request body stream, leaving `context.request` intact if any error occurs.

---

## Scaffolding, CI Verification & Test Helpers

### 1. CLI (`emdash-schema-i18n extract`)

Extract schema, collection, taxonomy, menu, and block-type strings from your `seed.json` file into a translation dictionary:

```bash
# Scaffold/update default locale (uk)
npx emdash-schema-i18n extract

# Scaffold multiple locales at once (creates empty TODO entries for all specified locales)
npx emdash-schema-i18n extract --locales=uk,de --seed=seed/seed.json --out=src/i18n/admin.ts

# Strip legacy bilingual slashes ("Українська / English" -> "English") in seed.json
npx emdash-schema-i18n extract --clean-seed

# CI check mode: exits with code 1 if any seed string is missing a translation
npx emdash-schema-i18n extract --check --locales=uk,de --seed=seed/seed.json --out=src/i18n/admin.ts
```

### 2. Test Helper (`assertDictionaryCovers`)

Verify dictionary completeness directly inside your project's unit test suite with a single call:

```javascript
import { test } from "node:test";
import seed from "../seed/seed.json" with { type: "json" };
import { adminDictionary } from "../src/i18n/admin.ts";
import { assertDictionaryCovers } from "emdash-schema-i18n";

test("adminDictionary covers all translatable labels in seed.json", () => {
  assertDictionaryCovers(seed, adminDictionary, ["uk"]);
});
```

### CLI Limitations
- **Seed-based static analysis**: `emdash-schema-i18n extract` reads your JSON seed file (`seed/seed.json`, `.emdash/seed.json`, or `--seed=<path>`). It does **not** connect to a live SQLite/LibSQL database to read runtime-created block types or collections that have not been exported to `seed.json`.

---

## License

[MIT](LICENSE) © Serhii Parshyn
