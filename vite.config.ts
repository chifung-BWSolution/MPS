import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";
import { developmentPlanStatic } from "./vite-plugin-development-plan-static";

const MPS_HOST = "kwcevjcmdjadhrygjyfp.supabase.co";

/** Prefer dedicated MPS_* secrets over shared Furniture/PMS VITE_* injections. */
function applyMpsEnvPreference() {
  const mpsUrl = (process.env.MPS_URL || "").trim();
  const mpsAnon = (process.env.MPS_ANON || "").trim();
  if (mpsUrl.includes(MPS_HOST) && mpsAnon) {
    process.env.VITE_SUPABASE_URL = mpsUrl;
    process.env.VITE_SUPABASE_ANON_KEY = mpsAnon;
  }
}

applyMpsEnvPreference();

// https://vitejs.dev/config/
export default defineConfig(async () => {
  const { tempoAnnotate } = await import("tempo-sdk");

  return {
  base: process.env.NODE_ENV === "development" ? "/" : process.env.VITE_BASE_PATH || "/",
  optimizeDeps: {
    entries: ["src/main.tsx", "src/tempobook/**/*"],
  },
  plugins: [
    tempoAnnotate(),
    react(),
    tsconfigPaths({ projectDiscovery: "lazy" }),
    developmentPlanStatic(__dirname),
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
