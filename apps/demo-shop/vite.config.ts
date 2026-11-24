import { defineConfig, type Plugin } from "vite";
import { shopApi } from "./server/shop-api";

/**
 * Mounts Shop A's server routes (server/shop-api.ts) on the Vite dev and
 * preview servers. They run in Node; the API key lives only there.
 * Only VITE_* env vars are exposed to the client, and the key is not one.
 */
function shopServer(): Plugin {
  return {
    name: "shop-a-server",
    configureServer(server) {
      server.middlewares.use(shopApi);
    },
    configurePreviewServer(server) {
      server.middlewares.use(shopApi);
    },
  };
}

export default defineConfig({
  plugins: [shopServer()],
  server: { port: 3001, strictPort: true },
  preview: { port: 3001, strictPort: true },
});
