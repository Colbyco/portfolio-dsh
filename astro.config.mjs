import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://colby-portfolio-dsh.vercel.app",
  output: "static",
  trailingSlash: "ignore",
  build: { inlineStylesheets: "always" },
  compressHTML: true,
  devToolbar: { enabled: false },
});
