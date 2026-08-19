import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

import { BRAND } from "@repo/ui/brand/constants";

import { devTokenBroker } from "./src/dev-server/devTokenBroker.ts";

const brandMetadata = {
  name: "brand-metadata",
  transformIndexHtml: {
    order: "pre" as const,
    handler(html: string) {
      return html
        .replaceAll("__BRAND_DESCRIPTION__", BRAND.description)
        .replaceAll("__BRAND_NAME__", BRAND.name);
    },
  },
};

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, ".", "CONTEXTPLANE_");
  const apiOrigin =
    process.env.CONTEXTPLANE_API_ORIGIN ??
    environment.CONTEXTPLANE_API_ORIGIN ??
    "http://localhost:8000";
  const idpOrigin =
    process.env.CONTEXTPLANE_DEV_IDP_ORIGIN ??
    environment.CONTEXTPLANE_DEV_IDP_ORIGIN ??
    "http://localhost:8090";
  const clientId =
    process.env.CONTEXTPLANE_DEV_CLIENT_ID ??
    environment.CONTEXTPLANE_DEV_CLIENT_ID ??
    "registry-dev";
  const clientSecret =
    process.env.CONTEXTPLANE_DEV_CLIENT_SECRET ??
    environment.CONTEXTPLANE_DEV_CLIENT_SECRET ??
    "dev-secret";

  return {
    plugins: [
      brandMetadata,
      react(),
      tailwindcss(),
      devTokenBroker({ clientId, clientSecret, idpOrigin }),
    ],
    server: {
      port: 3000,
      proxy: {
        "/v1": {
          changeOrigin: true,
          target: apiOrigin,
        },
      },
    },
  };
});
