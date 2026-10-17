import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";
import { schemaLocalization } from "../src/index.mjs";
import { adminDictionary } from "./src/i18n/admin.ts";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  devToolbar: {
    enabled: false,
  },
  vite: {
    resolve: {
      alias: {
        "emdash-schema-i18n/admin": new URL("../src/admin/index.tsx", import.meta.url).pathname,
        "emdash-schema-i18n/middleware": new URL("../src/middleware.mjs", import.meta.url).pathname,
        "emdash-schema-i18n": new URL("../src/index.mjs", import.meta.url).pathname,
      },
    },
    server: {
      fs: {
        allow: [".."],
      },
    },
    ssr: {
      noExternal: ["emdash", "@emdash-cms/admin"],
    },
  },
  integrations: [
    react(),
    emdash({
      database: sqlite({ url: "file:./data.db" }),
      storage: local({
        directory: "./uploads",
        baseUrl: "/_emdash/api/media/file",
      }),
      plugins: [
        schemaLocalization({
          dictionary: adminDictionary,
        }),
      ],
    }),
  ],
});
