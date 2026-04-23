import { defineConfig } from "vite";
import { getHttpsServerOptions } from "office-addin-dev-certs";
import { resolve } from "node:path";

const httpsOptions = await getHttpsServerOptions(365);

export default defineConfig(({ mode }) => ({
  base: "/",
  server: {
    host: "localhost",
    port: 5174,
    https: httpsOptions,
  },
  preview: {
    host: "localhost",
    port: 5174,
    https: httpsOptions,
  },
  build: {
    assetsDir: "word/assets",
    rollupOptions: {
      input: {
        home: resolve(__dirname, "index.html"),
        download: resolve(__dirname, "download/index.html"),
        tutorials: resolve(__dirname, "tutorials/index.html"),
        about: resolve(__dirname, "about/index.html"),
        privacy: resolve(__dirname, "privacy/index.html"),
        terms: resolve(__dirname, "terms/index.html"),
        support: resolve(__dirname, "support/index.html"),
        word: resolve(__dirname, "word/index.html"),
      },
      output: {
        entryFileNames: "word/assets/[name]-[hash].js",
        chunkFileNames: "word/assets/[name]-[hash].js",
        assetFileNames: "word/assets/[name]-[hash][extname]",
      },
    },
  },
}));
