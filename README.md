# emdash-schema-i18n

> Dynamic schema, collections, and block types localization for **EmDash CMS** Admin UI.

[![npm version](https://img.shields.io/npm/v/emdash-schema-i18n.svg)](https://www.npmjs.com/package/emdash-schema-i18n)
[![npm downloads](https://img.shields.io/npm/dm/emdash-schema-i18n.svg)](https://www.npmjs.com/package/emdash-schema-i18n)
[![license](https://img.shields.io/npm/l/emdash-schema-i18n.svg)](LICENSE)

**Author:** Serhii Parshyn (<serhii@parshyn.com>)

---

## Overview

In EmDash CMS, metadata for collections, fields, and block types (`label`, `labelSingular`, `description`, `category`) are stored statically in the database schema. When building multilingual admin sites, developers previously had to combine languages with slashes (e.g. `"Кейси / Case studies"` or `"Заголовок / Title"`), which cluttered the interface.

`emdash-schema-i18n` solves this seamlessly by dynamically localizing schema metadata based on the administrator's active session language (`emdash-locale` cookie or `Accept-Language` header).

---

## Features

- **Direct English-first schema:** Keep all your database models and `seed.json` schemas in clean English without slashes.
- **Dictionary phrase lookup:** Easily map English phrases to any target language (`"Case studies": "Кейси"`, `"Chapter": "Розділ"`).
- **Exact path overrides:** Override specific fields when needed (e.g. `collections.case_study.fields.title.label`).
- **Comprehensive coverage:** Localizes collections (including sidebar `group` folders), singular labels, field inputs, dropdown options, taxonomies, menus, plugin UI contributions, and block types with all their nested version fields.
- **Automatic Scaffolding:** Scans schemas and block types to scaffold untranslated strings via CLI (`--locale=uk`, `--locale=pl`, etc.).
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
2. **Server Middleware (`withSchemaLocalization` or `createLocalizationMiddleware`)**: Intercepts `/_emdash/api/manifest` and `/_emdash/api/schema/block-types` to dynamically translate labels according to the active administrator's language.

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

> **Note:** `schemaLocalization()` registers the plugin descriptor and client `adminEntry`. All translation options (`dictionary`, `defaultLocale`, `separator`, etc.) are configured in your server middleware (`src/middleware.mjs` / `src/middleware.ts`).

### 2. In Middleware (`src/middleware.mjs`)

#### Option A: Standalone Middleware
If you don't have other middleware:

```javascript
import { createLocalizationMiddleware } from "emdash-schema-i18n/middleware";
import { adminDictionary } from "./i18n/admin.ts";

export const onRequest = createLocalizationMiddleware({
  dictionary: adminDictionary,
  defaultLocale: "en",
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

On incoming requests to `/_emdash/api/*`, `resolveAdminLocale` determines the active admin language in the following order:

1. **Query Parameter (`?locale=<code>`)**: Highest priority by default for debugging and E2E testing (can be disabled via `allowQueryParam: false`, or placed after cookie via `preferCookieOverQuery: true`).
2. **Cookie (`emdash-locale`)**: Standard cookie set by EmDash Admin UI (Lingui) when an administrator selects an interface language (can be disabled via `useCookie: false`, or given top priority via `preferCookieOverQuery: true`).
3. **`Accept-Language` Header**: Parses quality weights (`;q=`) and selects the highest-priority language (can be disabled via `useAcceptLanguage: false`).
4. **Fallback (`defaultLocale`)**: Defaults to `"en"`.

> **Important (Cookie vs `Accept-Language`):** If an administrator opens the Admin UI for the very first time before an `emdash-locale` cookie is saved, EmDash's client-side Lingui UI may default to `"en"` while the browser sends `Accept-Language: uk-UA,uk;q=0.9`. If you want schema localization to strictly follow the `emdash-locale` cookie (and `defaultLocale` when no cookie is present), pass `useAcceptLanguage: false` to `createLocalizationMiddleware({ dictionary, useAcceptLanguage: false })`.

---

## Translation Resolution Order

For any given label or schema property, `emdash-schema-i18n` resolves translations in the following order:

1. **Exact Key-Path Override**: Direct match in `dictionary[locale][key]` (e.g. `collections.case_study.fields.title.label`).
2. **Phrase Dictionary Lookup**: Direct match in `dictionary[locale][value]` (e.g. `"Case studies" -> "Кейси"`).
3. **Explicit Multi-language Object**: Objects formatted as `{ uk: "...", en: "..." }`.
4. **Bilingual Slash String Fallback**: Strings formatted as `"Українська / English"` (split only when there are exactly two parts and active locale matches `separatorLocales`, default `["uk", "en"]`).

> **Note on English (`en`)**: If the active locale is `en`, English schema definitions are displayed in their original form. English phrases in the dictionary are not searched as source values; to override English labels, use exact key-path overrides (e.g. `dictionary.en["collections.case_study.label"]`).

---

## Data Safety & Schema Editor Protection

By default, `excludeSchemaEditor: true` and `localizeTaxonomies: true` are enabled:
- **Content Editor & Navigation**: Fully localized via `/_emdash/api/manifest`, `/_emdash/api/schema/block-types`, and `/_emdash/api/taxonomies` (`GET /_emdash/api/taxonomies` and `GET /_emdash/api/taxonomies/[name]`).
- **Taxonomy Terms Untouched**: Term endpoints (`/_emdash/api/taxonomies/[name]/terms...`, `.../translations`, `.../reorder`) are never modified because terms are content with native per-locale rows in EmDash.
- **Taxonomy Editor Dual Protection**:
  1. **Referer Check**: Requests to `GET /_emdash/api/taxonomies...` originating from the Taxonomy Management screen (`Referer: /_emdash/admin/taxonomies...`) are not localized so the form displays canonical labels.
  2. **Reverse-Mapping on `PUT`/`PATCH`**: If `PUT /_emdash/api/taxonomies/[name]` receives a `label`, `labelSingular`, or `description` matching the active locale's translation, the middleware automatically restores the original canonical string before saving to the database.
- **Content Types / Schema Editor**: Calls to `/_emdash/api/schema/collections/*` are **not** localized by default. This ensures that opening a collection in Content Types and clicking **Save** will never overwrite your canonical database schema with a localized string.
- If you explicitly want to localize collections schema endpoints as well, set `localizeSchemaCollections: true`. To disable taxonomy endpoint localization, set `localizeTaxonomies: false`.
- **External API Scripts Warning**: `GET /_emdash/api/schema/block-types` and `GET /_emdash/api/schema/block-types/<slug>` are localized for `GET` requests so the Admin UI block picker displays translated block labels and field names. While EmDash Admin UI (`1.3.0`) does not round-trip `GET` block-type labels into `PUT`, any external automation script that fetches `GET /_emdash/api/schema/block-types/<slug>` and writes the returned `label` back via `PUT` will write the localized label for the request's resolved locale (or the English half of a legacy `"uk / en"` label when called without cookies).

---

## Scaffolding & CLI

To extract schema and block type strings from your seed file into a translation dictionary automatically:

```bash
# Run directly via npx (defaults to --locale=uk)
npx emdash-schema-i18n extract

# Or specify a custom target locale, seed path, or output file
npx emdash-schema-i18n extract --locale=pl --seed=seed/seed.json --out=src/i18n/admin.ts

# Strip legacy bilingual slashes ("Українська / English" -> "English") in seed.json
npx emdash-schema-i18n extract --clean-seed
```

### CLI Limitations
- **Seed-based static analysis**: `emdash-schema-i18n extract` reads your JSON seed file (`seed/seed.json`, `.emdash/seed.json`, or `--seed=<path>`). It does **not** connect to a live SQLite/LibSQL database to read runtime-created block types or collections that have not been exported to `seed.json`.
- **Target locale**: By default, `extract` scaffolds the `uk` dictionary key (`--locale=uk`) and assumes legacy bilingual slash strings in `seed.json` are ordered as `"<targetLocale> / <English>"`. Use `--locale=<code>` to scaffold additional locales while preserving existing locale blocks in `src/i18n/admin.ts`.

---

## License

[MIT](LICENSE) © Serhii Parshyn
