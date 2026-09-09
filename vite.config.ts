import path from "path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";

function resolveAppVersion() {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VITE_APP_VERSION ||
    `dev-${Date.now()}`
  );
}

function appVersionPlugin(): Plugin {
  const version = resolveAppVersion();
  const payload = JSON.stringify({ version });

  return {
    name: "app-version",
    config() {
      return {
        define: {
          __APP_VERSION__: JSON.stringify(version),
        },
      };
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const urlPath = req.url?.split("?")[0];
        if (urlPath !== "/version.json") {
          next();
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(payload);
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: payload,
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(async () => {
  const { tempoAnnotate } = await import("tempo-sdk");

  return {
  base: process.env.NODE_ENV === "development" ? "/" : process.env.VITE_BASE_PATH || "/",
  optimizeDeps: {
    entries: ["src/main.tsx", "src/tempobook/**/*"],
  },
  plugins: [
    appVersionPlugin(),
    tempoAnnotate(),
    react(),
    tsconfigPaths({ projectDiscovery: "lazy" }),
  ],
  resolve: {
    preserveSymlinks: true,
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    // @ts-ignore
    allowedHosts: process.env.TEMPO === "true" ? true : undefined,
    host: process.env.TEMPO === "true" ? '0.0.0.0' : undefined,
  }
  };
});
