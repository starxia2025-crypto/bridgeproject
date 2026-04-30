import { createLogger, defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const envDir = path.resolve(import.meta.dirname, "..", "..");
const suppressedSourcemapWarning = "Error when using sourcemap for reporting an error";

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, envDir, "");
  const rawPort = env.PORT || "4173";
  const port = Number(rawPort);
  const viteLogger = createLogger();
  const originalWarn = viteLogger.warn;

  viteLogger.warn = (msg, options) => {
    if (typeof msg === "string" && msg.includes(suppressedSourcemapWarning)) {
      return;
    }

    originalWarn(msg, options);
  };

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  const basePath = env.BASE_PATH || "/";

  return {
    envDir,
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      runtimeErrorOverlay(),
      ...(env.NODE_ENV !== "production" && env.REPL_ID !== undefined
        ? [
            await import("@replit/vite-plugin-cartographer").then((m) =>
              m.cartographer({
                root: path.resolve(import.meta.dirname, ".."),
              }),
            ),
            await import("@replit/vite-plugin-dev-banner").then((m) =>
              m.devBanner(),
            ),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    customLogger: viteLogger,
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
      sourcemap: false,
      chunkSizeWarningLimit: 1500,
    },
    server: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
