/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import compression from "vite-plugin-compression";

export default defineConfig({
  plugins: [react(), compression()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // En Windows, observar estas carpetas provoca EBUSY: cargo compila
    // .exe/.dll bloqueados y el antivirus los mantiene abiertos -> el
    // watcher de vite revienta y tumba beforeDevCommand.
    watch: {
      ignored: ["**/src-tauri/target/**", "**/venv/**", "**/dist/**", "**/node_modules/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: ["es2021", "chrome100", "safari13"],
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      output: {
        // Solo React se agrupa a mano (caché estable). NO agrupar dnd-kit:
        // coloca helpers compartidos dentro de ese chunk y el entry acaba
        // importándolo estáticamente, anulando el lazy de LyricsView — con el
        // splitting natural dnd-kit cae en el chunk de Letras (cargado al abrir).
        manualChunks: {
          react: ["react", "react-dom"],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.js"],
    include: ["src/**/*.{test,spec}.{js,jsx}"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.{js,jsx}"],
      exclude: ["src/**/*.test.*", "src/test-setup.js", "src/main.jsx", "src/icons/Icons.jsx"],
    },
  },
});
