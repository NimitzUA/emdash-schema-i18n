import { createLocalizationMiddleware } from "../../src/middleware.mjs";
import { adminDictionary } from "./i18n/admin.ts";

export const onRequest = createLocalizationMiddleware({
  dictionary: adminDictionary,
  defaultLocale: "en",
  injectHtmlWatcher: true,
  localizeSchemaCollections: true,
});
