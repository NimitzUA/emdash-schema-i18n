# emdash-schema-i18n

> Dynamic schema, collections, and block types localization for **EmDash CMS** Admin UI.

[![npm version](https://img.shields.io/badge/version-1.1.1-blue.svg)](https://github.com/NimitzUA/emdash-schema-i18n)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

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
- **Comprehensive coverage:** Localizes collections, singular labels, field inputs, dropdown options, and block types with all their nested version fields.
- **Automatic Scaffolding:** Comes with an extraction script (`npm run i18n:extract`) that scans schemas and block types to scaffold untranslated strings.
- **Zero-config slash fallback:** Still supports automatic splitting of legacy bilingual strings (`"Українська / English"`).

---

## Compatibility & Requirements

| Component | Supported Version | Notes |
| :--- | :--- | :--- |
| **EmDash CMS (`emdash`)** | `>= 1.0.1` | Tested up to `1.3.0+` |
| **EmDash Admin (`@emdash-cms/admin`)** | `>= 1.2.0` | Required for admin UI |
| **Astro** | `>= 6.0.0` | Supports Astro 6 and Astro 7 |
| **Node.js** | `>= 22.16` | Required by EmDash runtime |
| **React / React DOM** | `>= 18.0.0` | Fully supports React 18 & 19 |

---

## Installation & Setup

### 1. In `astro.config.mjs`

```javascript
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { schemaLocalization } from "emdash-schema-i18n";
import { adminDictionary } from "./src/i18n/admin";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [
        schemaLocalization({
          dictionary: adminDictionary,
        }),
      ],
      middleware: {
        outer: "./src/lib/private-access-middleware.mjs",
      },
    }),
  ],
});
```

### 2. In Middleware (`src/lib/private-access-middleware.mjs`)

```javascript
import {
  resolveAdminLocale,
  localizeManifest,
  localizeBlockTypesResponse,
  localizeCollectionsResponse,
} from "emdash-schema-i18n";
import { adminDictionary } from "../i18n/admin.ts";

export async function onRequest(context, next) {
  const response = await next();

  if (response?.status >= 200 && response?.status < 300) {
    const pathname = context.url.pathname;
    const isManifest = pathname === "/_emdash/api/manifest";
    const isBlockTypes = pathname === "/_emdash/api/schema/block-types";
    const isCollections = pathname.startsWith("/_emdash/api/schema/collections");

    if (isManifest || isBlockTypes || isCollections) {
      const locale = resolveAdminLocale(context.request);
      const data = await response.clone().json();
      let localized = data;

      if (isManifest) {
        localized = localizeManifest(data, locale, { dictionary: adminDictionary });
      } else if (isBlockTypes) {
        localized = localizeBlockTypesResponse(data, locale, { dictionary: adminDictionary });
      } else if (isCollections) {
        localized = localizeCollectionsResponse(data, locale, { dictionary: adminDictionary });
      }

      const headers = new Headers(response.headers);
      headers.set("Content-Type", "application/json; charset=utf-8");
      headers.set("Vary", "Cookie, Accept-Language");
      return new Response(JSON.stringify(localized), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
  }

  return response;
}
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

## Scaffolding

To extract all schema and block type strings automatically:

```bash
npm run i18n:extract
```

The script scans `seed/seed.json` and block types, preserves all existing translations, and appends any newly created untranslated fields.

---

## License

[MIT](LICENSE) © Serhii Parshyn
