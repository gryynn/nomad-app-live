import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

// Plugin to inject version into sw.js at build time
function swVersionPlugin(version) {
  return {
    name: "sw-version",
    writeBundle() {
      const swPath = resolve("dist/sw.js");
      try {
        let sw = readFileSync(swPath, "utf-8");
        sw = sw.replace("__SW_VERSION__", version);
        writeFileSync(swPath, sw);
        console.log(`[sw-version] Injected version ${version} into sw.js`);
      } catch {
        // sw.js may not exist in dev mode
      }
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react(), tailwindcss(), swVersionPlugin(pkg.version)],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8400",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8400",
        ws: true,
      },
    },
  },
});
