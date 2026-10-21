import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defaultServerConditions, defineConfig } from "vite";

// Builds a Cloudflare Worker: dist/server/server.js (SSR + API) and dist/client (static assets).
export default defineConfig(({ command }) => ({
  resolve: { tsconfigPaths: true },
  ssr: {
    ...(command === "build"
      ? {
          target: "webworker" as const,
          resolve: {
            conditions: ["workerd", "worker", "browser", ...defaultServerConditions.filter((c) => c !== "node")],
          },
        }
      : {}),
    noExternal: command === "build" ? true : undefined,
    external: ["cloudflare:workers"],
  },
  build: { rollupOptions: { external: [/^cloudflare:/] } },
  plugins: [tanstackStart({ server: { entry: "server" } }), react(), tailwindcss()],
}));
